from __future__ import annotations

import argparse
import math
import shutil
from pathlib import Path

import numpy as np
from PIL import Image


Image.MAX_IMAGE_PIXELS = None


def dzi_dimensions(width: int, height: int) -> list[tuple[int, int]]:
    max_level = math.ceil(math.log2(max(width, height)))
    return [
        (
            max(1, math.ceil(width / (2 ** (max_level - level)))),
            max(1, math.ceil(height / (2 ** (max_level - level)))),
        )
        for level in range(max_level + 1)
    ]


def downsample_half(src: np.ndarray, dest_path: Path, width: int, height: int) -> np.memmap:
    out_height = math.ceil(height / 2)
    out_width = math.ceil(width / 2)
    dest_shape = (out_height, out_width) if src.ndim == 2 else (out_height, out_width, src.shape[2])
    dest = np.memmap(dest_path, dtype=np.uint8, mode="w+", shape=dest_shape)

    rows_per_block = 128
    for y0 in range(0, out_height, rows_per_block):
        y1 = min(out_height, y0 + rows_per_block)
        src_y0 = y0 * 2
        src_y1 = min(height, y1 * 2)
        block = src[src_y0:src_y1, :width].astype(np.uint16)

        if block.shape[0] % 2:
            block = np.concatenate([block, block[-1:, ...]], axis=0)
        if block.shape[1] % 2:
            block = np.concatenate([block, block[:, -1:, ...]], axis=1)

        averaged = (
            block[0::2, 0::2, ...]
            + block[1::2, 0::2, ...]
            + block[0::2, 1::2, ...]
            + block[1::2, 1::2, ...]
        ) // 4
        dest[y0:y1, ...] = averaged[: y1 - y0, :out_width, ...].astype(np.uint8)

    dest.flush()
    return dest


def write_tiles(level: int, image: np.ndarray, width: int, height: int, tiles_dir: Path, tile_size: int, quality: int) -> None:
    level_dir = tiles_dir / str(level)
    level_dir.mkdir(parents=True, exist_ok=True)

    cols = math.ceil(width / tile_size)
    rows = math.ceil(height / tile_size)
    for row in range(rows):
        y0 = row * tile_size
        y1 = min(height, y0 + tile_size)
        for col in range(cols):
            x0 = col * tile_size
            x1 = min(width, x0 + tile_size)
            tile = np.asarray(image[y0:y1, x0:x1, ...])
            mode = "L" if tile.ndim == 2 else "RGB"
            Image.fromarray(tile, mode).save(level_dir / f"{col}_{row}.jpg", quality=quality, optimize=True)


def source_memmap(path: Path) -> tuple[np.memmap, int, int]:
    with Image.open(path) as im:
        width, height = im.size
        if path.suffix.lower() in {".tif", ".tiff"} and im.mode in {"L", "RGB"} and im.info.get("compression") == "raw":
            tile = im.tile[0]
            offset = tile.offset
            shape = (height, width) if im.mode == "L" else (height, width, 3)
            data = np.memmap(path, dtype=np.uint8, mode="r", offset=offset, shape=shape)
            return data, width, height

        if im.mode not in {"L", "RGB"}:
            im = im.convert("RGB")

        shape = (height, width) if im.mode == "L" else (height, width, 3)
        temp_path = path.with_suffix(path.suffix + ".rgbtmp")
        data = np.memmap(temp_path, dtype=np.uint8, mode="w+", shape=shape)
        data[...] = np.asarray(im)
        data.flush()
        return data, width, height


def write_dzi(output_dir: Path, name: str, width: int, height: int, tile_size: int, image_format: str) -> None:
    dzi = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<Image TileSize="{tile_size}" Overlap="0" Format="{image_format}" '
        f'xmlns="http://schemas.microsoft.com/deepzoom/2008">\n'
        f'  <Size Width="{width}" Height="{height}"/>\n'
        f"</Image>\n"
    )
    (output_dir / f"{name}.dzi").write_text(dzi, encoding="utf-8")


def rotate_clockwise(src: np.ndarray, dest_path: Path, width: int, height: int) -> tuple[np.memmap, int, int]:
    dest_shape = (width, height) if src.ndim == 2 else (width, height, src.shape[2])
    dest = np.memmap(dest_path, dtype=np.uint8, mode="w+", shape=dest_shape)

    rows_per_block = 256
    for y0 in range(0, width, rows_per_block):
        y1 = min(width, y0 + rows_per_block)
        if src.ndim == 2:
            dest[y0:y1, :] = src[::-1, y0:y1].T
        else:
            dest[y0:y1, :, :] = np.transpose(src[::-1, y0:y1, :], (1, 0, 2))

    dest.flush()
    return dest, height, width


def flip_image(
    src: np.ndarray,
    dest_path: Path,
    width: int,
    height: int,
    horizontal: bool,
    vertical: bool,
) -> tuple[np.memmap, int, int]:
    dest_shape = (height, width) if src.ndim == 2 else (height, width, src.shape[2])
    dest = np.memmap(dest_path, dtype=np.uint8, mode="w+", shape=dest_shape)

    rows_per_block = 256
    for y0 in range(0, height, rows_per_block):
        y1 = min(height, y0 + rows_per_block)
        src_y0 = height - y1 if vertical else y0
        src_y1 = height - y0 if vertical else y1
        block = src[src_y0:src_y1, ...]
        if vertical:
            block = block[::-1, ...]
        if horizontal:
            block = block[:, ::-1, ...]
        dest[y0:y1, ...] = block

    dest.flush()
    return dest, width, height


def build_pyramid(
    source: Path,
    output_dir: Path,
    name: str,
    tile_size: int,
    quality: int,
    keep_temp: bool,
    rotate_right: bool,
    flip_horizontal: bool,
    flip_vertical: bool,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    tiles_dir = output_dir / f"{name}_files"
    if tiles_dir.exists():
        shutil.rmtree(tiles_dir)
    dzi_path = output_dir / f"{name}.dzi"
    if dzi_path.exists():
        dzi_path.unlink()
    tiles_dir.mkdir()

    temp_dir = output_dir / f"_{name}_pyramid_tmp"
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
    temp_dir.mkdir()

    src, width, height = source_memmap(source)
    if rotate_right:
        src, width, height = rotate_clockwise(src, temp_dir / "rotated_source.rgb", width, height)
    if flip_horizontal or flip_vertical:
        src, width, height = flip_image(
            src,
            temp_dir / "flipped_source.rgb",
            width,
            height,
            flip_horizontal,
            flip_vertical,
        )

    dims = dzi_dimensions(width, height)
    max_level = len(dims) - 1
    levels: dict[int, np.ndarray] = {max_level: src}
    current = src
    current_width = width
    current_height = height

    for level in range(max_level - 1, -1, -1):
        level_width, level_height = dims[level]
        temp_path = temp_dir / f"level_{level}.rgb"
        current = downsample_half(current, temp_path, current_width, current_height)
        levels[level] = current
        current_width, current_height = level_width, level_height

    for level, (level_width, level_height) in enumerate(dims):
        print(f"Writing level {level}/{max_level}: {level_width}x{level_height}", flush=True)
        write_tiles(level, levels[level], level_width, level_height, tiles_dir, tile_size, quality)

    write_dzi(output_dir, name, width, height, tile_size, "jpg")

    if keep_temp:
        print(f"Kept temporary pyramid at {temp_dir}")
    else:
        shutil.rmtree(temp_dir)
        source_temp = source.with_suffix(source.suffix + ".rgbtmp")
        if source_temp.exists():
            source_temp.unlink()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create Deep Zoom tiles for the Galactic Centre Explorer.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path("tiles"))
    parser.add_argument("--name", default="galactic-centre")
    parser.add_argument("--tile-size", type=int, default=512)
    parser.add_argument("--quality", type=int, default=88)
    parser.add_argument("--keep-temp", action="store_true")
    parser.add_argument("--rotate-right", action="store_true", help="Rotate the source image 90 degrees clockwise.")
    parser.add_argument("--flip-horizontal", action="store_true", help="Flip the source image from left to right.")
    parser.add_argument("--flip-vertical", action="store_true", help="Flip the source image from top to bottom.")
    args = parser.parse_args()

    build_pyramid(
        args.source,
        args.output,
        args.name,
        args.tile_size,
        args.quality,
        args.keep_temp,
        args.rotate_right,
        args.flip_horizontal,
        args.flip_vertical,
    )


if __name__ == "__main__":
    main()
