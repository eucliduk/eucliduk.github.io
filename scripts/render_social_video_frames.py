from __future__ import annotations

import argparse
import math
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageEnhance


IMAGE_WIDTH = 27000
IMAGE_HEIGHT = 22500
MAX_LEVEL = 15
TILE_SIZE = 512
DEFAULT_OUTPUT_WIDTH = 1080
DEFAULT_OUTPUT_HEIGHT = 1080
FPS = 30


@dataclass(frozen=True)
class View:
    x: float
    y: float
    side: float


FEATURES = {
    "home": View(IMAGE_WIDTH / 2, IMAGE_HEIGHT / 2, IMAGE_WIDTH),
    "molecular-cloud": View(20780 + 3320 / 2, 12880 + 2320 / 2, 3320),
    "nebula": View(7950 + 2450 / 2, 5650 + 1390 / 2, 2450),
    "star-cluster": View(19350 + 3550 / 2, 5700 + 2000 / 2, 3550),
    "countless-stars": View(13500 + 4700 / 2, 14000 + 3600 / 2, 4700),
    "bridge-cloud-nebula": View(15100, 10300, 11800),
    "bridge-nebula-cluster": View(15100, 6550, 12600),
    "bridge-cluster-stars": View(18100, 11350, 11600),
    "bridge-stars-home": View(14500, 13500, 16000),
}

TIMELINE = [
    (0.0, "home"),
    (4.0, "home"),
    (13.0, "molecular-cloud"),
    (16.0, "molecular-cloud"),
    (20.0, "bridge-cloud-nebula"),
    (27.0, "nebula"),
    (30.0, "nebula"),
    (34.0, "bridge-nebula-cluster"),
    (41.0, "star-cluster"),
    (44.0, "star-cluster"),
    (48.0, "bridge-cluster-stars"),
    (55.0, "countless-stars"),
    (58.0, "countless-stars"),
    (62.0, "bridge-stars-home"),
    (72.0, "home"),
]


class TileCache:
    def __init__(self, root: Path, max_items: int = 180) -> None:
        self.root = root
        self.max_items = max_items
        self.cache: OrderedDict[tuple[int, int, int], Image.Image] = OrderedDict()

    def get(self, level: int, tile_x: int, tile_y: int) -> Image.Image:
        key = (level, tile_x, tile_y)
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]

        path = self.root / str(level) / f"{tile_x}_{tile_y}.jpg"
        tile = Image.open(path).convert("RGB")
        self.cache[key] = tile
        if len(self.cache) > self.max_items:
            self.cache.popitem(last=False)
        return tile


def ease_in_out_sine(progress: float) -> float:
    return -(math.cos(math.pi * progress) - 1) / 2


def lerp(a: float, b: float, progress: float) -> float:
    return a + (b - a) * progress


def interpolate(a: View, b: View, progress: float) -> View:
    p = ease_in_out_sine(progress)
    return View(
        x=lerp(a.x, b.x, p),
        y=lerp(a.y, b.y, p),
        side=lerp(a.side, b.side, p),
    )


def view_at(time_seconds: float) -> View:
    for index in range(len(TIMELINE) - 1):
        start_time, start_name = TIMELINE[index]
        end_time, end_name = TIMELINE[index + 1]
        if start_time <= time_seconds <= end_time:
            start = FEATURES[start_name]
            end = FEATURES[end_name]
            if end_time == start_time:
                return end
            progress = (time_seconds - start_time) / (end_time - start_time)
            return interpolate(start, end, progress)
    return FEATURES[TIMELINE[-1][1]]


def level_for_view(crop_width: float, crop_height: float, output_width: int, output_height: int) -> int:
    source_pixels_per_output_pixel = max(crop_width / output_width, crop_height / output_height)
    if source_pixels_per_output_pixel <= 1:
        return MAX_LEVEL
    level = MAX_LEVEL - math.ceil(math.log2(source_pixels_per_output_pixel))
    return max(0, min(MAX_LEVEL, level))


def level_size(level: int) -> tuple[int, int]:
    scale = 2 ** (MAX_LEVEL - level)
    return math.ceil(IMAGE_WIDTH / scale), math.ceil(IMAGE_HEIGHT / scale)


def render_view(view: View, tile_cache: TileCache, output_width: int, output_height: int) -> Image.Image:
    crop_width = view.side
    crop_height = view.side * output_height / output_width
    level = level_for_view(crop_width, crop_height, output_width, output_height)
    scale = 2 ** (MAX_LEVEL - level)
    level_w, level_h = level_size(level)

    left = (view.x - crop_width / 2) / scale
    top = (view.y - crop_height / 2) / scale
    scaled_crop_width = crop_width / scale
    scaled_crop_height = crop_height / scale

    output = Image.new("RGB", (output_width, output_height), (0, 0, 0))
    src_left = max(0, math.floor(left))
    src_top = max(0, math.floor(top))
    src_right = min(level_w, math.ceil(left + scaled_crop_width))
    src_bottom = min(level_h, math.ceil(top + scaled_crop_height))

    if src_right <= src_left or src_bottom <= src_top:
        return output

    region = Image.new("RGB", (src_right - src_left, src_bottom - src_top), (0, 0, 0))
    first_tile_x = src_left // TILE_SIZE
    last_tile_x = (src_right - 1) // TILE_SIZE
    first_tile_y = src_top // TILE_SIZE
    last_tile_y = (src_bottom - 1) // TILE_SIZE

    for tile_y in range(first_tile_y, last_tile_y + 1):
        for tile_x in range(first_tile_x, last_tile_x + 1):
            tile = tile_cache.get(level, tile_x, tile_y)
            tile_left = tile_x * TILE_SIZE
            tile_top = tile_y * TILE_SIZE
            intersection_left = max(src_left, tile_left)
            intersection_top = max(src_top, tile_top)
            intersection_right = min(src_right, tile_left + tile.width)
            intersection_bottom = min(src_bottom, tile_top + tile.height)

            if intersection_right <= intersection_left or intersection_bottom <= intersection_top:
                continue

            tile_crop = tile.crop(
                (
                    intersection_left - tile_left,
                    intersection_top - tile_top,
                    intersection_right - tile_left,
                    intersection_bottom - tile_top,
                )
            )
            region.paste(tile_crop, (intersection_left - src_left, intersection_top - src_top))

    crop_left = src_left - left
    crop_top = src_top - top
    output_left = round((crop_left / scaled_crop_width) * output_width)
    output_top = round((crop_top / scaled_crop_height) * output_height)
    output_w = round((region.width / scaled_crop_width) * output_width)
    output_h = round((region.height / scaled_crop_height) * output_height)

    resized = region.resize((max(1, output_w), max(1, output_h)), Image.Resampling.LANCZOS)
    output.paste(resized, (output_left, output_top))

    output = ImageEnhance.Contrast(output).enhance(1.03)
    output = ImageEnhance.Sharpness(output).enhance(1.08)
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tiles", type=Path, default=Path("tiles/galactic-centre_files"))
    parser.add_argument("--output", type=Path, default=Path("output/social_square_frames"))
    parser.add_argument("--fps", type=int, default=FPS)
    parser.add_argument("--duration", type=float, default=72.0)
    parser.add_argument("--size", type=int, default=0, help="Set both width and height to this value.")
    parser.add_argument("--width", type=int, default=DEFAULT_OUTPUT_WIDTH)
    parser.add_argument("--height", type=int, default=DEFAULT_OUTPUT_HEIGHT)
    parser.add_argument("--quality", type=int, default=96)
    parser.add_argument("--limit", type=int, default=0, help="Render only the first N frames for testing.")
    args = parser.parse_args()
    output_width = args.size or args.width
    output_height = args.size or args.height

    args.output.mkdir(parents=True, exist_ok=True)
    tile_cache = TileCache(args.tiles)
    frame_count = int(round(args.duration * args.fps))
    if args.limit:
        frame_count = min(frame_count, args.limit)

    for frame in range(frame_count):
        time_seconds = frame / args.fps
        image = render_view(view_at(time_seconds), tile_cache, output_width, output_height)
        image.save(args.output / f"frame_{frame:05d}.jpg", "JPEG", quality=args.quality, subsampling=1)
        if frame % args.fps == 0 or frame == frame_count - 1:
            print(f"Rendered frame {frame + 1}/{frame_count}")


if __name__ == "__main__":
    main()
