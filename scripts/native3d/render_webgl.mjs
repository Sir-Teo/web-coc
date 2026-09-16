#!/usr/bin/env node
// Offline WebGL2 renderer for scripts/native3d/bake_hero_art.py. No npm dependencies beyond Playwright.
// Usage: node scripts/native3d/render_webgl.mjs <work>/job.json
// The job lists skinned meshes, decoded textures, per-pose joint matrices and render records. Output is
// raw straight-alpha RGBA rows (top row first) appended per render to each character's frames.bin.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const jobPath = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !fs.existsSync(jobPath)) {
  console.error('usage: render_webgl.mjs <job.json>');
  process.exit(2);
}
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
const work = path.dirname(jobPath);
const ORIGIN = 'http://native3d.render';

const page_html = `<!doctype html><meta charset="utf-8"><canvas id="c" width="1" height="1"></canvas><script>
'use strict';
const gl = document.getElementById('c').getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: false });
if (!gl) throw new Error('WebGL2 unavailable');
function shader(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(vs, fs) {
  const p = gl.createProgram(); gl.attachShader(p, shader(gl.VERTEX_SHADER, vs)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
const SCENE_VS = (joints) => \`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal; layout(location=2) in vec4 aTangent;
layout(location=3) in vec2 aUv; layout(location=4) in uvec4 aJoints; layout(location=5) in vec4 aWeights;
uniform mat4 uJoints[\${joints}]; uniform mat4 uModelView; uniform mat4 uProj;
out vec3 vN; out vec3 vT; out float vW; out vec2 vUv;
void main() {
  mat4 skin = aWeights.x * uJoints[aJoints.x] + aWeights.y * uJoints[aJoints.y] + aWeights.z * uJoints[aJoints.z] + aWeights.w * uJoints[aJoints.w];
  mat4 mv = uModelView * skin;
  mat3 nm = transpose(inverse(mat3(mv)));
  vN = nm * aNormal; vT = mat3(mv) * aTangent.xyz; vW = aTangent.w < 0.0 ? -1.0 : 1.0; vUv = aUv;
  gl_Position = uProj * (mv * vec4(aPos, 1.0));
}\`;
const SCENE_FS = \`#version 300 es
precision highp float;
in vec3 vN; in vec3 vT; in float vW; in vec2 vUv;
uniform sampler2D uBase; uniform sampler2D uNormal; uniform sampler2D uEmission;
uniform bool uHasNormal; uniform bool uHasEmission; uniform float uAmbient; uniform float uDiffuse; uniform vec3 uLight; uniform float uEmissionGain;
out vec4 outColor;
void main() {
  vec3 n = normalize(gl_FrontFacing ? vN : -vN);
  if (uHasNormal) {
    vec4 t = texture(uNormal, vUv);
    vec2 xy = t.ra * 2.0 - 1.0;
    float z = sqrt(max(0.0, 1.0 - dot(xy, xy)));
    vec3 T = normalize(vT - n * dot(n, vT));
    vec3 B = cross(n, T) * vW;
    n = normalize(T * xy.x + B * xy.y + n * z);
  }
  vec3 base = texture(uBase, vUv).rgb;
  vec3 color = base * (uAmbient + uDiffuse * max(dot(n, uLight), 0.0));
  if (uHasEmission) color += texture(uEmission, vUv).rgb * uEmissionGain;
  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}\`;
const QUAD_VS = \`#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }\`;
const DOWN_FS = \`#version 300 es
precision highp float; uniform sampler2D uSrc; uniform int uSS; out vec4 outColor;
void main() {
  ivec2 o = ivec2(gl_FragCoord.xy) * uSS; vec3 c = vec3(0.0); float a = 0.0;
  for (int y = 0; y < uSS; y++) for (int x = 0; x < uSS; x++) { vec4 t = texelFetch(uSrc, o + ivec2(x, y), 0); c += t.rgb * t.a; a += t.a; }
  outColor = a > 0.0 ? vec4(c / a, a / float(uSS * uSS)) : vec4(0.0);
}\`;
const downProgram = program(QUAD_VS, DOWN_FS);
let state = null;

function texture(image) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
async function loadImage(url) {
  const blob = await (await fetch(url)).blob();
  return await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
}
function target(w, h, depth) {
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const color = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, color);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
  if (depth) {
    const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  }
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete framebuffer');
  return { fb, color, w, h };
}

window.setupCharacter = async (spec) => {
  const buf = await (await fetch(spec.mesh.url)).arrayBuffer();
  const view = (name, Type, size) => { const a = spec.mesh.arrays[name]; return new Type(buf, a.offset, a.count * size); };
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const attrib = (loc, data, size, type, integer) => {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    if (integer) gl.vertexAttribIPointer(loc, size, type, 0, 0); else gl.vertexAttribPointer(loc, size, type, false, 0, 0);
  };
  attrib(0, view('position', Float32Array, 3), 3, gl.FLOAT);
  attrib(1, view('normal', Float32Array, 3), 3, gl.FLOAT);
  attrib(2, view('tangent', Float32Array, 4), 4, gl.FLOAT);
  attrib(3, view('uv', Float32Array, 2), 2, gl.FLOAT);
  attrib(4, view('joints', Uint8Array, 4), 4, gl.UNSIGNED_BYTE, true);
  attrib(5, view('weights', Float32Array, 4), 4, gl.FLOAT);
  const indices = view('indices', Uint32Array, 1);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  const prog = program(SCENE_VS(spec.joints), SCENE_FS);
  const poses = new Float32Array(await (await fetch(spec.poses)).arrayBuffer());
  const tex = {};
  for (const [k, url] of Object.entries(spec.textures)) tex[k] = texture(await loadImage(url));
  const ss = spec.supersample;
  state = { vao, prog, poses, tex, indexCount: indices.length, joints: spec.joints, ss, light: spec.light,
    big: target(spec.maxWidth * ss, spec.maxHeight * ss, true), small: target(spec.maxWidth, spec.maxHeight, false),
    loc: (n) => gl.getUniformLocation(prog, n) };
  return { renderer: gl.getParameter(gl.RENDERER), indices: indices.length };
};

window.renderBatch = (records) => {
  const s = state; const out = [];
  let total = 0; for (const r of records) total += r.w * r.h * 4;
  const pixels = new Uint8Array(total); let cursor = 0;
  for (const r of records) {
    const W = r.w * s.ss, H = r.h * s.ss;
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.big.fb); gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.useProgram(s.prog); gl.bindVertexArray(s.vao);
    gl.uniformMatrix4fv(s.loc('uJoints'), false, s.poses.subarray(r.pose * s.joints * 16, (r.pose + 1) * s.joints * 16));
    gl.uniformMatrix4fv(s.loc('uModelView'), false, new Float32Array(r.modelView));
    const [l, rt, b, t, n, f] = r.window;
    gl.uniformMatrix4fv(s.loc('uProj'), false, new Float32Array([2/(rt-l),0,0,0, 0,2/(t-b),0,0, 0,0,-2/(f-n),0, -(rt+l)/(rt-l),-(t+b)/(t-b),-(f+n)/(f-n),1]));
    let unit = 0;
    for (const [name, flag] of [['base', null], ['normal', 'uHasNormal'], ['emission', 'uHasEmission']]) {
      if (flag) gl.uniform1i(s.loc(flag), s.tex[name] ? 1 : 0);
      if (!s.tex[name]) continue;
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, s.tex[name]);
      gl.uniform1i(s.loc('u' + name[0].toUpperCase() + name.slice(1)), unit++);
    }
    gl.uniform1f(s.loc('uAmbient'), s.light.ambient); gl.uniform1f(s.loc('uDiffuse'), s.light.diffuse);
    gl.uniform3fv(s.loc('uLight'), new Float32Array(s.light.direction)); gl.uniform1f(s.loc('uEmissionGain'), s.light.emission);
    gl.drawElements(gl.TRIANGLES, s.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.small.fb); gl.viewport(0, 0, r.w, r.h);
    gl.disable(gl.DEPTH_TEST); gl.useProgram(downProgram); gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.big.color);
    gl.uniform1i(gl.getUniformLocation(downProgram, 'uSrc'), 0); gl.uniform1i(gl.getUniformLocation(downProgram, 'uSS'), s.ss);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const row = new Uint8Array(r.w * r.h * 4);
    gl.readPixels(0, 0, r.w, r.h, gl.RGBA, gl.UNSIGNED_BYTE, row);
    for (let y = 0; y < r.h; y++) pixels.set(row.subarray((r.h - 1 - y) * r.w * 4, (r.h - y) * r.w * 4), cursor + y * r.w * 4);
    cursor += r.w * r.h * 4;
  }
  return fetch('${ORIGIN}/out', { method: 'POST', body: pixels }).then(res => res.status);
};
window.ready = true;
</script>`;

const args = job.gpu === 'metal' ? ['--use-gl=angle', '--use-angle=metal'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args });
const page = await browser.newPage();
page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
let sink = null;
await page.route(`${ORIGIN}/**`, async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === '/') return route.fulfill({ body: page_html, contentType: 'text/html' });
  if (url.pathname === '/out') {
    fs.writeSync(sink, route.request().postDataBuffer());
    return route.fulfill({ status: 204 });
  }
  const file = path.join(work, decodeURIComponent(url.pathname.slice('/work/'.length)));
  if (url.pathname.startsWith('/work/') && file.startsWith(work) && fs.existsSync(file)) {
    return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.png') ? 'image/png' : 'application/octet-stream' });
  }
  return route.fulfill({ status: 404 });
});
await page.goto(`${ORIGIN}/`);
await page.waitForFunction(() => window.ready === true);

for (const character of job.characters) {
  const started = Date.now();
  const records = JSON.parse(fs.readFileSync(path.join(work, character.records), 'utf8'));
  const url = (file) => `${ORIGIN}/work/${encodeURIComponent(file)}`;
  const spec = {
    mesh: { url: url(character.mesh), arrays: character.arrays }, poses: url(character.poses), joints: character.joints,
    textures: Object.fromEntries(Object.entries(character.textures).map(([k, v]) => [k, url(v)])),
    supersample: job.supersample, light: job.light,
    maxWidth: Math.max(...records.map((r) => r.w)), maxHeight: Math.max(...records.map((r) => r.h)),
  };
  const info = await page.evaluate((s) => window.setupCharacter(s), spec);
  sink = fs.openSync(path.join(work, character.output), 'w');
  const batch = job.batch ?? 48;
  for (let i = 0; i < records.length; i += batch) {
    const status = await page.evaluate((r) => window.renderBatch(r), records.slice(i, i + batch));
    if (status !== 204) throw new Error(`frame upload failed: ${status}`);
  }
  fs.closeSync(sink);
  console.log(`${character.key}: ${records.length} renders in ${((Date.now() - started) / 1000).toFixed(1)}s (${info.renderer})`);
}
await browser.close();
