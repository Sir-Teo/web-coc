#!/usr/bin/env python3
"""Capture original HUD controls without alternate modes, notification badges or text."""
import argparse
from io import BytesIO
import json
import numpy as np
from PIL import Image
from native_art.bundle import ROOT, BUNDLE, source, digest
from native_art.sc6 import SC6, require
from native_art.scene_graph import capture_graph
from native_art.static_scene import FrameZeroScene
from native_art.multiply_scene import nodes, compose

PINS = {
    'sc/hud.sc': '05c4a1f5892e7d97e6e4a4c46eb24bbd14db5b9e9ca0fc8a30f5ec1cf2a373da',
    'sc/ui.sc': '200abb4f7e79b0cc78b829e891b644d21653168ec4892dc864cb6d81c30109b0',
}


class EmbeddedTextures(dict):
    """Decode only the embedded sheets reachable from the selected control graphics."""
    def __init__(self, sc):
        self.sc = sc

    def __missing__(self, index):
        self[index] = np.array(self.sc.embedded_texture(index), dtype=float) / 255
        return self[index]


def coordinates(poses):
    output = []
    for pose in poses:
        if 'group' in pose:
            output.extend(coordinates(pose['group']))
        else:
            vertices = np.array(pose['vertices']).reshape(-1, 4)
            matrix = np.array(pose['matrix']).reshape(2, 3)
            output.extend(np.column_stack([vertices[:, :2], np.ones(len(vertices))]) @ matrix.T)
    return output


def capture(sc, textures, id_, role, path):
    graph = capture_graph(FrameZeroScene(sc), {role: id_}, allowed_blends=(0, 3, 4, 8))
    xy = np.array(coordinates(nodes(graph, id_, 0, np.eye(3))))
    low, high = np.floor(xy.min(0)).astype(int) - 2, np.ceil(xy.max(0)).astype(int) + 2
    width, height = high - low
    root = np.array([[1, 0, -low[0]], [0, 1, -low[1]], [0, 0, 1]])
    rgba = compose(nodes(graph, id_, 0, root), textures, int(max(width, height)))[:height, :width]
    alpha = rgba[:, :, 3:4]
    rgb = np.divide(rgba[:, :, :3], alpha, out=np.zeros_like(rgba[:, :, :3]), where=alpha > 0)
    pixels = np.round(np.clip(np.concatenate([rgb, alpha], axis=2), 0, 1) * 255).astype(np.uint8)
    encoded = BytesIO()
    Image.fromarray(pixels, 'RGBA').save(encoded, format='PNG')
    png = encoded.getvalue()
    return dict(bounds=[*map(int, low), *map(int, high)], width=int(width), height=int(height),
                path=path, bytes=len(png), sha256=digest(png), rgbaSha256=digest(pixels.tobytes()),
                graph=graph), png


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    sc = SC6(source('sc/hud.sc', PINS))
    require(sc.exports['hud_button_fight'] == 217, 'HUD export changed')
    button = sc.clip(217)
    require(button['children'][2] == 201 and button['names'][2] == 'icon',
            'Fight icon slot changed')
    require(button['children'][0] == 55 and button['names'][0] == '', 'Button background changed')
    require(sc.clip(201)['labels'][0] == 'no_stars', 'Campaign icon frame changed')
    textures = {i: np.array(sc.embedded_texture(i), dtype=float) / 255
                for i in range(len(sc.textures))}
    icon, png = capture(sc, textures, 201, 'campaign', 'assets/hud-native/campaign.png')
    background, background_png = capture(sc, textures, 55, 'background', 'assets/hud-native/fight-button.png')
    background = dict(childSlot=0, childName='', shapeId=55, **background)
    record = dict(bundle=BUNDLE, sources=PINS, export='hud_button_fight', exportId=217,
                  childSlot=2, childName='icon', clipId=201, frame=0, label='no_stars',
                  **icon, background=background)
    outputs = [(ROOT / 'public' / icon['path'], png),
               (ROOT / 'public' / background['path'], background_png)]
    ui = SC6(source('sc/ui.sc', PINS), max_decompressed_bytes=512 * 1024 * 1024)
    require(ui.exports['ui_bottom_right'] == 23287, 'UI controls root changed')
    ui_textures = EmbeddedTextures(ui)
    controls = []
    for role, selection in [
        ('shop', [(23287, 2, 'button_shop', 23270), (23270, 1, '', 21791)]),
        ('settings', [(23287, 0, 'button_settings', 22639), (22639, 0, '', 22637)]),
    ]:
        for parent, slot, name, child in selection:
            clip = ui.clip(parent)
            require(clip['children'][slot] == child and clip['names'][slot] == name,
                    f'Original {role} selection changed')
            require(any(p[0] == slot for p in clip['frames'][0]), f'{role} absent from frame zero')
        require(ui.clip(23270)['labels'][0] == 'Normal', 'Normal shop mode changed')
        asset, data = capture(ui, ui_textures, selection[-1][3], role, f'assets/hud-native/{role}.png')
        controls.append(dict(role=role, source='sc/ui.sc', export='ui_bottom_right', exportId=23287,
                             selection=[dict(clip=parent, slot=slot, name=name, child=child)
                                        for parent, slot, name, child in selection],
                             frame=0, **asset))
        outputs.append((ROOT / 'public' / asset['path'], data))
    record['controls'] = controls
    outputs.append((ROOT / 'reference/hud/native.json', (json.dumps(record, indent=2) + '\n').encode()))
    for target, data in outputs:
        if args.check:
            require(target.read_bytes() == data, f'Native HUD output differs: {target}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
    print(f'Native HUD: {sum(len(data) for path, data in outputs[:-1])} image bytes; source pixels verified')


if __name__ == '__main__':
    main()
