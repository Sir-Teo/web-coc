"""Expose only placements active at source frame zero to strict graph capture.

This is a static portrait view, not an animation export. Active unsupported nodes
still reach the ordinary capture guards; inactive children cannot affect this pose.
"""


class FrameZeroScene:
    def __init__(self, source):
        self.source = source
        self._clips = {}

    def __getattr__(self, name):
        return getattr(self.source, name)

    def clip(self, id_):
        if id_ not in self._clips:
            clip = self.source.clip(id_)
            frame = clip['frames'][0]
            slots = list(dict.fromkeys(placement[0] for placement in frame))
            remap = {slot: index for index, slot in enumerate(slots)}
            self._clips[id_] = dict(
                clip, children=[clip['children'][slot] for slot in slots],
                names=[clip['names'][slot] for slot in slots],
                blending=[clip['blending'][slot] for slot in slots],
                frames=[[(remap[slot], matrix, tint) for slot, matrix, tint in frame]],
                labels=clip['labels'][:1])
        return self._clips[id_]
