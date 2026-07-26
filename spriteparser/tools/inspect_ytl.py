import sys
from pathlib import Path
import struct
from PIL import Image

MAGIC = b"\x09\x00\x00\x00"
OFF_TABLE_START = 0x04C0
DATA_BASE = 0x0BF4
END_OFFSET_PTR = 0x0BC8
TRANSPARENT = 0xFE

# Minimal palettes (importing GUI pulls in Tk). Adjust if needed.
from imjin_spr_gui import PALETTES  # uses same palette as app

def u32(b, off): return struct.unpack_from("<I", b, off)[0]

def decode_raw_fe(src: bytes, max_out: int | None = None) -> bytes:
    # FE,count = run of FE; other bytes are literals. No padding.
    i = 0
    out = bytearray()
    n = len(src)
    while i < n and (max_out is None or len(out) < max_out):
        b = src[i]
        i += 1
        if b == TRANSPARENT:
            if i >= n: break
            run = src[i]
            i += 1
            if max_out is None:
                out.extend(bytes([TRANSPARENT]) * run)
            else:
                need = max_out - len(out)
                if need <= 0: break
                out.extend(bytes([TRANSPARENT]) * min(run, need))
        else:
            out.append(b)
    return bytes(out)

def read_header(b: bytes):
    if not b.startswith(MAGIC):
        raise ValueError("MAGIC mismatch")
    W = u32(b, 0x04)
    H = u32(b, 0x08)
    F = u32(b, 0x0C)
    offs = [u32(b, OFF_TABLE_START + 4*i) for i in range(F)]
    end_rel = u32(b, END_OFFSET_PTR)
    return W, H, F, offs, end_rel

def frame_blob(b: bytes, i: int, offs: list[int], end_rel: int) -> bytes:
    cur = offs[i]
    nxt = offs[i+1] if i+1 < len(offs) else end_rel
    return b[DATA_BASE+cur : DATA_BASE+nxt]

def render_rect(W, H, pixels, palette):
    # fills left-to-right, top-to-bottom, pads with FE
    buf = bytearray([TRANSPARENT]) * (W*H)
    n = min(len(pixels), W*H)
    buf[:n] = pixels[:n]
    im = Image.frombytes("P", (W, H), bytes(buf))
    im.putpalette(list(palette[:768]))
    return im

def render_span_rows(W, H, pixels, palette, header_bytes_per_row):
    # Try interpreting first header_bytes_per_row*H bytes as (offset,count) table
    hdr_sz = header_bytes_per_row * H
    if len(pixels) < hdr_sz:
        return None, "not enough bytes for header"
    pos = 0
    spans = []
    ok = True
    for y in range(H):
        if header_bytes_per_row == 2:
            off = pixels[pos]; cnt = pixels[pos+1]
        elif header_bytes_per_row == 4:
            off = pixels[pos] | (pixels[pos+1]<<8)
            cnt = pixels[pos+2] | (pixels[pos+3]<<8)
        else:
            return None, "unsupported header size"
        pos += header_bytes_per_row
        if off+cnt > W:
            ok = False
        spans.append((off, cnt))
    # remaining is payload
    payload = pixels[hdr_sz:]
    need = sum(c for _,c in spans)
    if need > len(payload):
        ok = False
    if not ok:
        return None, f"invalid spans (need {need}, have {len(payload)})"
    # build buffer
    buf = bytearray([TRANSPARENT]) * (W*H)
    p = 0
    for y,(off,cnt) in enumerate(spans):
        if cnt == 0: continue
        row_start = y*W + off
        buf[row_start:row_start+cnt] = payload[p:p+cnt]
        p += cnt
    im = Image.frombytes("P", (W, H), bytes(buf))
    im.putpalette(list(palette[:768]))
    return im, f"ok spans payload={need}, header={hdr_sz}"

def render_iso_row_stream(W, H, comp: bytes, palette):
    # Hypothesis: each row is stored as: [offset:1][count:1][count bytes of indices]
    # No FE runs; empty areas are implicit (transparent index 0xFE in our render buffer)
    pos = 0
    buf = bytearray([TRANSPARENT]) * (W * H)
    total_payload = 0
    rows = []
    for y in range(H):
        if pos + 2 > len(comp):
            return None, f"row {y}: header truncated at {pos}/{len(comp)}"
        off = comp[pos]
        cnt = comp[pos + 1]
        pos += 2
        if pos + cnt > len(comp):
            return None, f"row {y}: payload truncated {pos}+{cnt}>{len(comp)}"
        # write span
        if off + cnt > W:
            return None, f"row {y}: off+cnt exceeds width ({off}+{cnt}>{W})"
        start = y * W + off
        buf[start:start + cnt] = comp[pos:pos + cnt]
        pos += cnt
        total_payload += cnt
        rows.append((off, cnt))
    # Optional: ensure we've consumed nearly all comp
    leftover = len(comp) - pos
    im = Image.frombytes("P", (W, H), bytes(buf))
    im.putpalette(list(palette[:768]))
    return im, f"ok iso rows payload={total_payload}, header={H*2}, leftover={leftover}, rows[0..4]={rows[:5]}"

def main():
    root = Path(".")
    target = None
    if len(sys.argv) > 1:
        target = Path(sys.argv[1])
    else:
        # first YTL under tile/
        for p in root.rglob("tile/**/*.ytl"):
            target = p
            break
    if not target or not target.exists():
        print("No .ytl found. Provide a path: python tools\\inspect_ytl.py path\\to\\file.ytl")
        return
    b = target.read_bytes()
    W,H,F,offs,end_rel = read_header(b)
    print(f"file={target.name} W={W} H={H} frames={F}")
    outdir = target.with_suffix("").with_name(target.stem + "_inspect")
    outdir.mkdir(exist_ok=True)
    palette = PALETTES.get("IMJIN2")  # adjust if needed

    # Inspect first few frames
    for fi in range(min(F, 3)):
        comp = frame_blob(b, fi, offs, end_rel)
        dec_full = decode_raw_fe(comp, None)
        print(f"- frame {fi}: comp={len(comp)} dec={len(dec_full)}")

        # 1) Naive rectangle
        im_rect = render_rect(W,H,dec_full, palette)
        im_rect.save(outdir / f"{target.stem}_f{fi:03d}_rect.png")

        # 2) Try (offset,count) per row with 1-byte pairs
        im2, msg2 = render_span_rows(W,H,dec_full, palette, 2)
        if im2:
            im2.save(outdir / f"{target.stem}_f{fi:03d}_span8.png")
        print(f"  span8: {msg2}")

        # 3) Try (offset,count) per row with 2-byte pairs
        im4, msg4 = render_span_rows(W,H,dec_full, palette, 4)
        if im4:
            im4.save(outdir / f"{target.stem}_f{fi:03d}_span16.png")
        print(f"  span16: {msg4}")

        # 4) Try isometric row stream (offset,count followed by data per row)
        im_iso, msg_iso = render_iso_row_stream(W, H, comp, palette)
        if im_iso:
            im_iso.save(outdir / f"{target.stem}_f{fi:03d}_iso.png")
        print(f"  iso: {msg_iso}")

    print(f"Outputs in: {outdir}")

if __name__ == "__main__":
    main()