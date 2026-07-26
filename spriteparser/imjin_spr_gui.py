# spr_batch_gui.py
# Python 3.9+  |  pip install pillow
import os
import struct
import threading
import queue
from pathlib import Path
from typing import List, Tuple, Optional

import tkinter as tk
from tkinter import ttk, filedialog, messagebox

try:
    from PIL import Image
except ImportError:
    raise SystemExit("Pillow가 필요합니다. 먼저 `pip install pillow` 를 실행하세요.")


# ====== SPR 포맷 고정 상수 (QuickBMS 스크립트와 동일) ======
MAGIC = b"\x09\x00\x00\x00"
OFF_TABLE_START = 0x04C0  # 프레임 오프셋 테이블 시작
DATA_BASE = 0x0BF4        # 프레임 압축데이터의 실제 파일 오프셋 기준
END_OFFSET_PTR = 0x0BC8   # 마지막 프레임의 '다음 오프셋' 포인터
TRANSPARENT_RUN_MARKER = 0xFE  # 0xFE 다음 1바이트 길이로 0xFE를 반복

# ====== 내장 팔레트 (RGB×256 = 768 bytes) ======
# QuickBMS 스크립트에 주석으로 들어 있던 블록을 그대로 옮김.
IMJIN1 = (
b"\x00\x00\x00\x3F\x3F\x3F\x32\x29\x3A\x32\x29\x3A\x33\x29\x3A\x33\x29\x3A"
b"\x33\x2A\x3A\x33\x2A\x3A\x34\x2A\x3A\x34\x2A\x3A\x34\x2A\x3A\x34\x2A\x3A"
b"\x34\x2A\x3A\x34\x2A\x3A\x34\x2A\x3A\x34\x2A\x3A\x3F\x3F\x3F\x39\x39\x39"
b"\x35\x35\x35\x32\x32\x32\x2E\x2E\x2E\x2B\x2B\x2B\x27\x27\x27\x24\x24\x24"
b"\x20\x20\x20\x1C\x1C\x1C\x17\x17\x17\x13\x13\x13\x0F\x0F\x0F\x0B\x0B\x0B"
b"\x07\x07\x07\x00\x00\x00\x3F\x32\x3F\x3F\x27\x3F\x3F\x1D\x3F\x3F\x13\x3F"
b"\x3F\x09\x3F\x3F\x00\x3F\x39\x03\x36\x33\x07\x2F\x2D\x05\x2A\x27\x03\x25"
b"\x21\x02\x1F\x1B\x01\x1A\x15\x00\x15\x0F\x00\x0F\x0A\x00\x09\x04\x00\x04"
b"\x3F\x38\x00\x3E\x32\x00\x3A\x2D\x00\x36\x28\x00\x32\x24\x00\x2F\x20\x00"
b"\x2B\x1C\x00\x27\x18\x00\x23\x15\x00\x1F\x11\x00\x1C\x0E\x00\x18\x0C\x00"
b"\x14\x09\x00\x10\x07\x00\x0D\x05\x00\x08\x03\x00\x3F\x37\x36\x3F\x2F\x2E"
b"\x3F\x28\x26\x3F\x20\x1E\x3F\x18\x16\x3F\x10\x0E\x3F\x07\x06\x3F\x00\x00"
b"\x37\x00\x00\x30\x00\x00\x28\x00\x00\x21\x00\x00\x19\x00\x00\x12\x00\x00"
b"\x0A\x00\x00\x03\x00\x00\x3F\x3C\x28\x3C\x38\x24\x39\x35\x21\x37\x32\x1D"
b"\x34\x2E\x1A\x31\x2B\x18\x2F\x28\x15\x2A\x22\x13\x25\x1D\x12\x20\x18\x10"
b"\x1B\x13\x0E\x16\x0F\x0C\x11\x0B\x09\x0D\x08\x07\x09\x04\x04\x06\x03\x03"
b"\x31\x28\x1E\x2D\x23\x1A\x29\x1F\x16\x25\x1B\x12\x21\x18\x0F\x1E\x15\x0C"
b"\x1B\x12\x09\x19\x10\x07\x17\x0E\x05\x15\x0C\x03\x13\x0A\x02\x11\x09\x01"
b"\x0F\x07\x00\x0D\x06\x00\x09\x04\x00\x05\x01\x00\x3F\x3B\x32\x3F\x37\x30"
b"\x3F\x34\x2A\x3E\x2F\x25\x3A\x29\x1E\x38\x20\x15\x32\x19\x0F\x2D\x14\x0C"
b"\x28\x10\x09\x23\x0C\x06\x1F\x08\x04\x1A\x05\x02\x15\x03\x01\x10\x01\x00"
b"\x0B\x00\x00\x05\x00\x00\x2F\x3F\x2F\x25\x3F\x25\x14\x3F\x14\x00\x3F\x00"
b"\x00\x38\x00\x00\x34\x00\x00\x30\x00\x00\x2C\x00\x00\x27\x00\x00\x23\x00"
b"\x00\x1E\x00\x00\x1A\x00\x00\x14\x00\x00\x10\x00\x00\x0C\x00\x00\x09\x00"
b"\x31\x35\x2B\x2C\x30\x25\x27\x2B\x20\x22\x26\x1C\x1E\x23\x18\x1A\x20\x14"
b"\x17\x1D\x11\x16\x1A\x10\x15\x18\x0F\x13\x15\x0E\x12\x13\x0D\x0E\x10\x09"
b"\x0A\x0D\x06\x07\x0B\x04\x05\x08\x02\x03\x05\x01\x37\x37\x3F\x30\x30\x3A"
b"\x2A\x2A\x35\x24\x24\x30\x1E\x1E\x2B\x19\x19\x26\x15\x15\x22\x12\x12\x1E"
b"\x0F\x0F\x1B\x0C\x0C\x18\x0A\x0A\x15\x08\x08\x12\x06\x06\x0F\x04\x04\x0C"
b"\x03\x03\x09\x01\x01\x04\x2D\x3B\x3F\x19\x32\x3F\x0F\x28\x3F\x0C\x1E\x3F"
b"\x09\x19\x3F\x06\x14\x3F\x03\x0F\x3F\x00\x0A\x3F\x00\x05\x3F\x00\x00\x3C"
b"\x00\x00\x37\x00\x00\x32\x00\x00\x28\x00\x00\x1E\x00\x00\x14\x00\x00\x0A"
b"\x0B\x13\x00\x09\x11\x00\x07\x0F\x00\x05\x0D\x00\x04\x0C\x00\x00\x07\x1A"
b"\x00\x06\x17\x00\x05\x15\x3B\x37\x3D\x3B\x37\x3D\x3B\x37\x3D\x3B\x37\x3D"
b"\x3B\x37\x3D\x3B\x37\x3D\x3B\x37\x3D\x3B\x37\x3D\x3E\x35\x28\x3A\x30\x23"
b"\x36\x2B\x1E\x32\x27\x1B\x2F\x24\x18\x2B\x21\x15\x27\x1D\x13\x23\x1A\x11"
b"\x20\x17\x0F\x1D\x13\x0D\x19\x11\x0B\x16\x0E\x09\x14\x0C\x07\x11\x09\x06"
b"\x0F\x08\x06\x0C\x06\x05\x32\x2A\x22\x2F\x25\x1D\x2C\x20\x17\x29\x1B\x13"
b"\x26\x16\x0D\x23\x13\x0B\x20\x11\x0A\x1E\x10\x09\x1B\x0E\x08\x19\x0D\x07"
b"\x16\x0B\x06\x14\x0A\x05\x12\x09\x05\x10\x08\x05\x0C\x04\x01\x07\x01\x00"
b"\x12\x12\x21\x0F\x0F\x1C\x0C\x0C\x18\x0A\x0A\x15\x08\x08\x12\x0A\x0A\x15"
b"\x0D\x0D\x19\x10\x10\x1D\x15\x00\x00\x1E\x00\x00\x2A\x00\x00\x37\x00\x00"
b"\x2A\x00\x00\x1E\x00\x00\x12\x00\x00\x1A\x15\x18"
)

IMJIN2 = (
b"\x00\x00\x00\x34\x5F\x2C\x34\x51\x2C\x34\x4A\x3F\x2C\x3F\x37\x2C\x42\x34"
b"\x2C\x42\x37\x29\x54\x25\x25\x4A\x29\x29\x3B\x29\x25\x34\x30\x25\x34\x37"
b"\x21\x34\x34\x21\x42\x1E\x1E\x34\x1E\x1A\x34\x29\xD1\xAF\x74\x88\x4D\x1E"
b"\x77\x5F\x37\xA8\x88\x54\x99\x7B\x4A\xBD\x9C\x5F\x4A\x3B\x13\x4D\x3F\x16"
b"\x3B\x29\x0B\x2C\x4D\x2C\x42\x74\x37\x42\x74\x34\x42\x6A\x3B\x3F\x66\x3B"
b"\x3B\x5B\x34\x37\x5F\x30\xD1\x9C\x6D\xB2\x77\x1A\xD1\xBD\xB2\xC3\x95\x21"
b"\xB8\x7E\x16\xC9\xAC\x70\xCC\xBD\xB5\xC3\x9F\x51\xB8\x74\x13\xC0\x8F\x1A"
b"\xC0\x99\x46\xCC\xB5\x92\xB2\x66\x0B\xAC\x51\x07\x99\x30\x04\x8F\x21\x04"
b"\x77\x0B\x00\x85\x7E\x70\x88\x77\x63\xB2\xA8\x9C\x8C\x82\x70\x9F\x95\x85"
b"\xB2\xA8\x9C\xBB\xB8\xAF\x92\x8F\x82\x99\x92\x88\xBB\xAF\x9F\x8C\x7B\x6A"
b"\x8F\x82\x6D\x37\x3B\x66\x34\x37\x58\x2C\x30\x51\x92\x8C\x7B\x3B\x30\x30"
b"\x29\x16\x07\x5F\x54\x4D\x00\xAF\x00\xAF\x00\x00\xAF\xAF\x00\x63\x58\x4D"
b"\x3F\x37\x25\x5B\x58\x4A\x4D\x4A\x21\x58\x46\x25\x9C\x88\x6D\x82\x74\x51"
b"\x74\x63\x42\x6D\x5F\x3F\x8F\x7E\x5F\x54\x4A\x37\x6D\x63\x54\x7B\x70\x5F"
b"\x4D\x4A\x3B\x77\x6D\x63\x7E\x6A\x66\x70\x6A\x5F\x6A\x63\x58\x3B\x37\x29"
b"\x5B\x54\x42\x4A\x46\x3B\x6A\x63\x51\x70\x6A\x5B\x4D\x42\x30\x42\x3B\x29"
b"\x5F\x54\x42\x42\x1E\x1A\x46\x34\x13\x54\x42\x1A\x66\x42\x3B\x51\x34\x2C"
b"\x82\x58\x4D\x74\x58\x30\x85\x46\x1E\x8F\x6D\x30\x85\x5F\x29\x99\x5B\x25"
b"\x6A\x3B\x1A\x66\x3B\x1A\x70\x37\x1A\x5F\x37\x16\x77\x46\x1A\x66\x13\x13"
b"\x4D\x25\x1E\xCE\xB5\x99\x5B\x30\x25\x6A\x3B\x2C\x70\x3F\x30\x77\x42\x34"
b"\x85\x4D\x51\x8C\x51\x42\x92\x58\x4D\x99\x63\x4D\xCE\xC0\x9F\xA8\x74\x5B"
b"\xB5\x85\x6A\xB8\x8C\x70\x66\x8C\x8C\x5F\x82\x7E\x54\x70\x77\x51\x77\x70"
b"\x4D\x66\x6D\x4A\x6A\x70\x42\x66\x66\x4A\x6A\x66\x4A\x58\x7E\x3F\x4A\x70"
b"\x3F\x63\x5F\x3F\x58\x5F\x37\x42\x66\x34\x4A\x5B\x30\x37\x5B\x25\x2C\x46"
b"\xB5\xC0\xCC\x34\x42\x5F\x30\x3F\x5B\x77\x5F\x51\x58\x4A\x3B\x51\x42\x34"
b"\x58\x46\x37\xAF\x99\x4D\xAC\x95\x4A\x63\x54\x13\x7B\x6A\x13\x85\x70\x13"
b"\x54\x5F\x5F\x3F\x4A\x4A\x85\xB5\xAF\x70\x9C\x9C\x4A\x51\x58\x7B\x29\x1A"
b"\x88\x34\x21\x9C\x42\x29\xAC\x4D\x34\xBB\x63\x3F\xC9\x85\x58\x82\x2C\x1E"
b"\x92\x3B\x25\xA2\x46\x2C\xB5\x5B\x3B\xC3\x70\x4A\xD1\xA5\x6D\xD4\xD4\xB8"
b"\xD4\xC9\x9F\xD4\xC0\x92\xD4\xB5\x88\xD4\xAF\x82\xD4\xC6\x95\xC9\x7B\x51"
b"\xCE\x8C\x5F\xD1\xA5\x74\xD1\xAF\x74\xD1\x9C\x6D\x34\x51\x37\x51\x25\x04"
b"\x4A\x21\x04\x42\x1E\x00\x37\x1A\x00\x34\x16\x00\x2C\x13\x00\x1E\x0B\x00"
b"\x63\x2C\x04\x51\x66\x85\x4A\x58\x7B\x46\x6D\x66\x42\x51\x74\x3B\x46\x66"
b"\x37\x4D\x5B\x2C\x37\x54\x25\x2C\x4D\x1E\x21\x46\x1A\x1E\x42\x1A\x1E\x42"
b"\x16\x1A\x3B\x16\x16\x37\x0F\x0F\x34\x58\x29\x04\x25\x25\x25\x46\x46\x46"
b"\x6D\x6D\x6D\x8F\x8F\x8F\x25\x13\x00\x46\x2C\x00\x6D\x4D\x00\x8F\x5F\x00"
b"\x25\x00\x25\x3F\x00\x3F\x5B\x00\x5B\x77\x00\x77\x00\x25\x25\x00\x3F\x3F"
b"\x00\x5B\x5B\x00\x77\x77\x25\x25\x00\x46\x46\x00\x6D\x6D\x00\x8F\x8F\x00"
b"\x00\x25\x00\x00\x3F\x00\x00\x5B\x00\x00\x77\x00\x25\x00\x00\x4A\x00\x00"
b"\x6D\x00\x00\x8F\x00\x00\x00\x00\x25\x00\x00\x4A\x00\x00\x6D\x00\x00\x8F"
b"\xC9\xC9\xC9\x0F\x0F\x0F\x1E\x1E\x1E\x2C\x2C\x2C\x3F\x3F\x3F\x4D\x4D\x4D"
b"\x5B\x5B\x5B\x6A\x6A\x6A\x7B\x7B\x7B\x88\x88\x88\x95\x95\x95\xA2\xA2\xA2"
b"\xB2\xB2\xB2\xBD\xBD\xBD\xD4\xC0\xD4\xD4\xD4\xD4"
)

MYTH = (
b"\x00\x00\x00\x30\x37\x39\x14\x30\x39\x1E\x32\x39\x2A\x2A\x28\x2D\x2C\x2B"
b"\x0E\x16\x1A\x0F\x16\x1D\x10\x16\x1B\x10\x18\x19\x12\x1A\x0A\x16\x1A\x0F"
b"\x19\x23\x0C\x18\x21\x0B\x16\x19\x0B\x14\x20\x0B\x10\x03\x00\x15\x04\x00"
b"\x1A\x05\x00\x1F\x06\x00\x24\x07\x00\x29\x08\x00\x2C\x10\x02\x28\x19\x0B"
b"\x12\x18\x1B\x14\x1A\x1D\x26\x21\x10\x2C\x00\x00\x34\x00\x00\x00\x2A\x00"
b"\x00\x32\x00\x2C\x2C\x00\x32\x32\x00\x17\x16\x12\x1E\x1C\x14\x13\x0F\x04"
b"\x19\x17\x14\x1C\x19\x16\x19\x1A\x14\x1B\x1A\x14\x15\x13\x0B\x1A\x16\x11"
b"\x1E\x1A\x11\x19\x16\x11\x1C\x17\x10\x17\x17\x0E\x1A\x16\x0D\x1A\x1A\x15"
b"\x1F\x1F\x18\x1F\x1F\x16\x1D\x1E\x16\x1C\x1C\x15\x0C\x07\x03\x10\x0E\x0D"
b"\x1A\x18\x10\x14\x0F\x06\x12\x09\x08\x13\x11\x0C\x12\x0D\x0C\x15\x11\x0F"
b"\x0E\x0E\x07\x19\x16\x10\x21\x1F\x1B\x1A\x17\x0F\x16\x0F\x0D\x18\x16\x10"
b"\x15\x10\x04\x1A\x17\x16\x19\x18\x15\x1A\x17\x13\x18\x16\x0D\x1C\x1B\x17"
b"\x1F\x18\x0E\x17\x13\x07\x1E\x1B\x17\x1F\x1B\x12\x21\x1F\x1A\x22\x1D\x1C"
b"\x23\x18\x15\x23\x1F\x16\x08\x08\x01\x1F\x1A\x0C\x1D\x18\x10\x17\x14\x0D"
b"\x26\x22\x1E\x27\x25\x21\x27\x27\x23\x1A\x17\x10\x28\x25\x20\x10\x0E\x09"
b"\x29\x24\x1D\x12\x0F\x08\x2A\x28\x23\x2F\x2C\x29\x31\x2E\x2A\x32\x30\x2E"
b"\x08\x0D\x17\x11\x17\x1C\x0A\x12\x24\x0E\x19\x26\x09\x14\x25\x0D\x18\x25"
b"\x0C\x14\x26\x0B\x16\x24\x0A\x13\x21\x0A\x12\x24\x09\x11\x23\x0D\x1B\x2F"
b"\x05\x11\x20\x13\x21\x34\x0A\x17\x2A\x29\x2A\x2B\x04\x0D\x1A\x07\x15\x26"
b"\x16\x16\x16\x04\x0A\x07\x0C\x10\x16\x14\x14\x11\x19\x19\x18\x0E\x11\x15"
b"\x18\x18\x1A\x12\x1A\x26\x1A\x1B\x1D\x12\x15\x1A\x0A\x0E\x14\x11\x12\x16"
b"\x0D\x12\x18\x0B\x0F\x15\x33\x1B\x10\x36\x1F\x13\x37\x25\x16\x35\x26\x19"
b"\x32\x23\x17\x2B\x1D\x12\x1F\x0E\x05\x2A\x11\x07\x30\x14\x09\x39\x1F\x0E"
b"\x39\x2D\x1F\x39\x29\x13\x39\x2B\x16\x39\x30\x20\x39\x33\x10\x39\x39\x33"
b"\x37\x1D\x0C\x39\x24\x0D\x0F\x04\x04\x11\x04\x04\x13\x05\x04\x1D\x09\x06"
b"\x1A\x08\x06\x22\x0C\x07\x27\x0D\x09\x2C\x10\x0B\x28\x10\x08\x35\x12\x0E"
b"\x39\x22\x16\x39\x28\x1A\x39\x34\x24\x39\x39\x2D\x15\x1C\x06\x01\x0C\x01"
b"\x02\x10\x02\x01\x02\x01\x03\x06\x01\x00\x0B\x00\x1C\x17\x0A\x01\x11\x01"
b"\x1A\x16\x01\x00\x15\x00\x04\x1C\x05\x05\x20\x06\x16\x1A\x08\x15\x11\x04"
b"\x16\x18\x0E\x13\x16\x05\x13\x1D\x0F\x11\x17\x0D\x17\x12\x08\x10\x16\x08"
b"\x10\x14\x09\x10\x17\x08\x10\x16\x0B\x10\x14\x08\x10\x11\x09\x10\x14\x08"
b"\x0F\x14\x09\x15\x10\x06\x0E\x15\x08\x0E\x13\x07\x0D\x11\x06\x09\x15\x06"
b"\x19\x1E\x09\x19\x1F\x11\x03\x23\x0B\x15\x1E\x0D\x0F\x18\x09\x14\x10\x05"
b"\x11\x1C\x0C\x14\x1A\x09\x18\x21\x14\x11\x0D\x03\x15\x1F\x09\x15\x1C\x0F"
b"\x13\x1E\x0B\x09\x0D\x08\x08\x10\x09\x07\x0F\x06\x22\x22\x21\x28\x27\x27"
b"\x16\x15\x15\x26\x25\x24\x0F\x0C\x02\x39\x39\x00\x00\x39\x00\x39\x00\x00"
b"\x12\x12\x12\x19\x19\x19\x21\x21\x21\x14\x0D\x00\x1D\x15\x00\x26\x1A\x00"
b"\x10\x00\x10\x16\x00\x16\x1D\x00\x1D\x00\x0D\x0D\x00\x16\x16\x00\x1D\x1D"
b"\x14\x14\x00\x1D\x1D\x00\x26\x26\x00\x00\x11\x00\x00\x19\x00\x00\x1F\x00"
b"\x14\x00\x00\x1F\x00\x00\x2A\x00\x00\x00\x00\x14\x00\x00\x1F\x00\x00\x2A"
b"\x1C\x18\x0C\x1B\x17\x0B\x1A\x16\x0C\x17\x14\x06\x16\x12\x07\x13\x10\x04"
b"\x11\x0F\x03\x06\x06\x06\x0B\x0B\x0B\x0E\x0E\x0E\x16\x16\x16\x1D\x1D\x1D"
b"\x28\x28\x28\x36\x36\x36\x39\x33\x39\x39\x39\x39"
)

PALETTES = {
    "IMJIN": IMJIN1,
    "IMJIN2": IMJIN2,
    "MYTH": MYTH,
}


# ====== SPR 디코딩 로직 ======
def read_u32le(data: bytes, off: int) -> int:
    return struct.unpack_from("<I", data, off)[0]


def decode_frame_rle_fe(src: bytes, out_len: int) -> bytes:
    i = 0
    out = bytearray()
    n = len(src)
    while i < n and len(out) < out_len:
        b = src[i]
        i += 1
        if b == TRANSPARENT_RUN_MARKER:
            if i >= n:
                break
            run = src[i]
            i += 1
            need = out_len - len(out)
            out.extend(bytes([TRANSPARENT_RUN_MARKER]) * min(run, need))
        else:
            out.append(b)
    # 일부 파일에서는 프레임 데이터가 모자랄 수 있으므로, 투명(0xFE)으로 채움
    if len(out) < out_len:
        out.extend(bytes([TRANSPARENT_RUN_MARKER]) * (out_len - len(out)))
    return bytes(out[:out_len])


def decode_frame_iso_row_stream(src: bytes, width: int, height: int) -> Optional[bytes]:
    """Decode per-row isometric tiles (YTL).
    Tries these variants in order:
      1) Interleaved 8-bit: [off:1][cnt:1][cnt data] per row
      2) Separated 8-bit: headers first (2*H), then payload
      3) Interleaved 16-bit: [off:2][cnt:2][cnt data] per row
      4) Separated 16-bit: headers first (4*H), then payload
    Returns None if no variant validates.
    """
    # 1) Interleaved 8-bit
    p = 0
    buf = bytearray([TRANSPARENT_RUN_MARKER]) * (width * height)
    ok = True
    for y in range(height):
        if p + 2 > len(src):
            ok = False
            break
        off = src[p]
        cnt = src[p + 1]
        p += 2
        if off + cnt > width or p + cnt > len(src):
            ok = False
            break
        if cnt:
            row_start = y * width + off
            buf[row_start:row_start + cnt] = src[p:p + cnt]
            p += cnt
    if ok and p == len(src):
        return bytes(buf)

    # 2) Separated 8-bit (headers then payload)
    if len(src) >= height * 2:
        p = 0
        total_need = 0
        ok = True
        for _y in range(height):
            off = src[p]
            cnt = src[p + 1]
            p += 2
            total_need += cnt
            if off + cnt > width:
                ok = False
                break
        if ok and p + total_need <= len(src) and (len(src) - (p + total_need)) <= (height * 2):
            buf = bytearray([TRANSPARENT_RUN_MARKER]) * (width * height)
            q = height * 2
            p = 0
            for y in range(height):
                off = src[p]
                cnt = src[p + 1]
                p += 2
                if cnt:
                    endq = q + cnt
                    if endq > len(src):
                        ok = False
                        break
                    row_start = y * width + off
                    buf[row_start:row_start + cnt] = src[q:endq]
                    q = endq
            if ok:
                return bytes(buf)

    # 3) Interleaved 16-bit
    p = 0
    buf = bytearray([TRANSPARENT_RUN_MARKER]) * (width * height)
    ok = True
    for y in range(height):
        if p + 4 > len(src):
            ok = False
            break
        off = src[p] | (src[p + 1] << 8)
        cnt = src[p + 2] | (src[p + 3] << 8)
        p += 4
        if off + cnt > width or p + cnt > len(src):
            ok = False
            break
        if cnt:
            row_start = y * width + off
            buf[row_start:row_start + cnt] = src[p:p + cnt]
            p += cnt
    if ok and p == len(src):
        return bytes(buf)

    # 4) Separated 16-bit (headers then payload)
    hdr16 = height * 4
    if len(src) >= hdr16:
        p = 0
        total_need = 0
        ok = True
        for _y in range(height):
            off = src[p] | (src[p + 1] << 8)
            cnt = src[p + 2] | (src[p + 3] << 8)
            p += 4
            total_need += cnt
            if off + cnt > width:
                ok = False
                break
        if ok and p + total_need <= len(src) and (len(src) - (p + total_need)) <= (height * 2):
            buf = bytearray([TRANSPARENT_RUN_MARKER]) * (width * height)
            q = hdr16
            p = 0
            for y in range(height):
                off = src[p] | (src[p + 1] << 8)
                cnt = src[p + 2] | (src[p + 3] << 8)
                p += 4
                if cnt:
                    endq = q + cnt
                    if endq > len(src):
                        ok = False
                        break
                    row_start = y * width + off
                    buf[row_start:row_start + cnt] = src[q:endq]
                    q = endq
            if ok:
                return bytes(buf)

    return None


def decode_spr_to_images(
    spr_path: Path,
    out_root: Optional[Path],
    palette_name: str,
    fmt: str = "png",
    make_transparent_fe: bool = False,
    write_info_txt: bool = True,
) -> Tuple[int, Path]:
    data = spr_path.read_bytes()
    if not data.startswith(MAGIC):
        raise ValueError("MAGIC 불일치(0x09 00 00 00). SPR 포맷이 다르거나 손상되었습니다.")

    width = read_u32le(data, 0x04)
    height = read_u32le(data, 0x08)
    frame_count = read_u32le(data, 0x0C)
    frame_xy = width * height

    if frame_count <= 0 or frame_count > 10000:
        raise ValueError(f"이상한 프레임 수: {frame_count}")

    # 오프셋들
    offsets_rel = [read_u32le(data, OFF_TABLE_START + 4 * i) for i in range(frame_count)]
    end_rel = read_u32le(data, END_OFFSET_PTR)

    pairs: List[Tuple[int, int]] = []
    for i in range(frame_count):
        cur_rel = offsets_rel[i]
        next_rel = offsets_rel[i + 1] if (i + 1) < frame_count else end_rel
        comp_size = next_rel - cur_rel
        abs_off = DATA_BASE + cur_rel
        if comp_size <= 0 or abs_off + comp_size > len(data):
            raise ValueError(f"프레임 {i} 범위가 비정상: off={abs_off}, size={comp_size}")
        pairs.append((abs_off, comp_size))

    pal_raw = PALETTES[palette_name]
    if len(pal_raw) < 768:
        raise ValueError(f"팔레트 데이터(내장)가 768바이트 미만: {len(pal_raw)}")
    palette_list = list(pal_raw[:768])  # Pillow는 768 길이 리스트/bytes 기대

    out_dir = out_root or spr_path.with_name(spr_path.stem + "_out")
    out_dir.mkdir(parents=True, exist_ok=True)

    # 이미지 저장
    saved_names: List[str] = []
    is_ytl = spr_path.suffix.lower() == ".ytl"
    for i, (off, size) in enumerate(pairs):
        comp = data[off:off + size]
        dec: Optional[bytes] = None
        if is_ytl:
            dec = decode_frame_iso_row_stream(comp, width, height)
            if dec is None:
                # Do not fall back to rectangular decode for YTL; it's an iso row stream.
                raise ValueError("YTL iso-row decode failed: unexpected frame layout")
        else:
            dec = decode_frame_rle_fe(comp, frame_xy)

        imP = Image.frombytes("P", (width, height), dec)
        imP.putpalette(palette_list)

        if make_transparent_fe:
            # 0xFE를 투명으로
            mask = Image.frombytes("L", (width, height), bytes(0 if b == 0xFE else 255 for b in dec))
            imRGB = imP.convert("RGB")
            im = imRGB.copy()
            im.putalpha(mask)
        else:
            im = imP

        fname = f"{spr_path.stem}_{i:04d}.{fmt}"
        save_path = out_dir / fname
        im.save(save_path)
        saved_names.append(fname)

    if write_info_txt:
        # 메타 정보 출력 (QuickBMS 스타일)
        lines = []
        crlf = "\r\n"
        lines.append("HQTEAM_SPR_BMP_INFO")
        lines.append(f"STRIPE_NAME|{spr_path.stem}")
        lines.append(f"TOTAL_FRAME_NUMBER|{frame_count}")
        lines.append(f"WIDTH|{width}")
        lines.append(f"HEIGHT|{height}")
        lines.append("FRAME_BITMAP_LIST:")
        lines.extend(saved_names)
        lines.append("END_OF_LIST|")
        (out_dir / f"{spr_path.stem}.txt").write_text(crlf.join(lines), encoding="utf-8")

    return frame_count, out_dir


# ====== GUI ======
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("IMJIN SPR Batch Decoder")
        self.geometry("920x640")
        self.minsize(860, 580)

        self.file_list: List[Path] = []
        self.log_q: "queue.Queue[str]" = queue.Queue()
        self.worker: Optional[threading.Thread] = None
        self.stop_flag = threading.Event()

        self._build_ui()
        self._poll_log()

    def _build_ui(self):
        pad = {"padx": 8, "pady": 6}

        # Top controls
        top = ttk.Frame(self)
        top.pack(fill="x", padx=8, pady=6)
        ttk.Button(top, text="Add SPR Files...", command=self.on_add_files).pack(side="left")
        ttk.Button(top, text="Add Folder...", command=self.on_add_folder).pack(side="left", padx=(6,0))
        self.recursive_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(top, text="Recursive", variable=self.recursive_var).pack(side="left", padx=(10,0))
        ttk.Button(top, text="Clear List", command=self.on_clear).pack(side="left", padx=(10,0))

        # Palette & options
        opt = ttk.Frame(self)
        opt.pack(fill="x", padx=8, pady=6)
        ttk.Label(opt, text="Palette:").pack(side="left")
        self.palette_var = tk.StringVar(value="IMJIN2")
        ttk.OptionMenu(opt, self.palette_var, "IMJIN2", *PALETTES.keys()).pack(side="left", padx=(6,10))
        ttk.Label(opt, text="Format:").pack(side="left")
        self.format_var = tk.StringVar(value="png")
        ttk.OptionMenu(opt, self.format_var, "png", "png", "bmp").pack(side="left", padx=(6,10))
        self.alpha_fe_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(opt, text="Index 0xFE → Transparent", variable=self.alpha_fe_var).pack(side="left", padx=(6,10))
        self.write_info_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(opt, text="Write info .txt", variable=self.write_info_var).pack(side="left", padx=(6,10))
        self.overwrite_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(opt, text="Overwrite existing", variable=self.overwrite_var).pack(side="left", padx=(6,10))

        # Output mode
        outfrm = ttk.Frame(self)
        outfrm.pack(fill="x", padx=8, pady=6)
        self.out_mode_var = tk.StringVar(value="perfile")
        ttk.Radiobutton(outfrm, text="Per-file _out next to each SPR", value="perfile", variable=self.out_mode_var).pack(side="left")
        ttk.Radiobutton(outfrm, text="Single output folder:", value="single", variable=self.out_mode_var).pack(side="left", padx=(20,6))
        self.out_dir_var = tk.StringVar(value="")
        out_entry = ttk.Entry(outfrm, textvariable=self.out_dir_var, width=50)
        out_entry.pack(side="left")
        ttk.Button(outfrm, text="Browse", command=self.on_browse_out).pack(side="left", padx=(6,0))

        # File list
        mid = ttk.Frame(self)
        mid.pack(fill="both", expand=True, padx=8, pady=6)
        self.listbox = tk.Listbox(mid, selectmode="extended")
        self.listbox.pack(side="left", fill="both", expand=True)
        vsb = ttk.Scrollbar(mid, orient="vertical", command=self.listbox.yview)
        vsb.pack(side="right", fill="y")
        self.listbox.configure(yscrollcommand=vsb.set)

        # Bottom controls
        bottom = ttk.Frame(self)
        bottom.pack(fill="x", padx=8, pady=6)
        ttk.Button(bottom, text="Start", command=self.on_start).pack(side="left")
        ttk.Button(bottom, text="Stop", command=self.on_stop).pack(side="left", padx=(6,0))
        ttk.Button(bottom, text="Open Output", command=self.on_open_output).pack(side="left", padx=(6,0))
        self.progress = ttk.Progressbar(bottom, mode="determinate")
        self.progress.pack(side="right", fill="x", expand=True)

        # Log area
        logfrm = ttk.LabelFrame(self, text="Log")
        logfrm.pack(fill="both", expand=True, padx=8, pady=(0,8))
        self.logtext = tk.Text(logfrm, height=10)
        self.logtext.pack(fill="both", expand=True, padx=6, pady=6)

    # ==== UI helpers ====
    def log(self, msg: str):
        self.log_q.put(msg)

    def _poll_log(self):
        try:
            while True:
                line = self.log_q.get_nowait()
                self.logtext.insert("end", line + "\n")
                self.logtext.see("end")
        except queue.Empty:
            pass
        self.after(60, self._poll_log)

    def on_add_files(self):
        paths = filedialog.askopenfilenames(
            title="Select .spr/.ytl files",
            filetypes=[
                ("SPR/YTL files", "*.spr *.ytl"),
                ("SPR files", "*.spr"),
                ("YTL files", "*.ytl"),
                ("All files", "*.*"),
            ]
        )
        if not paths: return
        self._append_files([Path(p) for p in paths])

    def on_add_folder(self):
        folder = filedialog.askdirectory(title="Select folder containing .spr/.ytl")
        if not folder: return
        folder = Path(folder)
        files = []
        if self.recursive_var.get():
            for ext in ("*.spr", "*.ytl"):
                files.extend(folder.rglob(ext))
        else:
            for ext in ("*.spr", "*.ytl"):
                files.extend(folder.glob(ext))
        self._append_files(files)

    def _append_files(self, items: List[Path]):
        added = 0
        for p in items:
            if p.exists() and p.suffix.lower() in (".spr", ".ytl") and p not in self.file_list:
                self.file_list.append(p)
                self.listbox.insert("end", str(p))
                added += 1
        self.log(f"+ Added {added} files (total: {len(self.file_list)})")

    def on_clear(self):
        self.file_list.clear()
        self.listbox.delete(0, "end")
        self.log("Cleared list")

    def on_browse_out(self):
        d = filedialog.askdirectory(title="Select output folder")
        if d:
            self.out_dir_var.set(d)

    def on_open_output(self):
        # 열 폴더: 모드에 따라
        target = None
        if self.out_mode_var.get() == "single" and self.out_dir_var.get():
            target = Path(self.out_dir_var.get())
        else:
            # 리스트의 첫 파일 기준
            if self.file_list:
                target = self.file_list[0].with_name(self.file_list[0].stem + "_out")
        if target and target.exists():
            try:
                os.startfile(target)  # Windows
            except Exception:
                self.log(f"Open folder: {target}")
        else:
            messagebox.showinfo("Open Output", "출력 폴더가 아직 없습니다.")

    def on_start(self):
        if self.worker and self.worker.is_alive():
            messagebox.showinfo("Busy", "이미 실행 중입니다.")
            return
        if not self.file_list:
            messagebox.showwarning("No files", "SPR 파일을 먼저 추가하세요.")
            return
        if self.out_mode_var.get() == "single":
            out_dir = self.out_dir_var.get().strip()
            if not out_dir:
                messagebox.showwarning("Output", "단일 출력 폴더를 선택하세요.")
                return
            Path(out_dir).mkdir(parents=True, exist_ok=True)

        self.stop_flag.clear()
        self.progress.configure(value=0, maximum=len(self.file_list))
        self.worker = threading.Thread(target=self._run_batch, daemon=True)
        self.worker.start()

    def on_stop(self):
        if self.worker and self.worker.is_alive():
            self.stop_flag.set()
            self.log("정지 신호 전송: 현재 파일까지 마무리 후 중단됩니다.")
        else:
            self.log("실행 중이 아닙니다.")

    def _run_batch(self):
        fmt = self.format_var.get()
        pal = self.palette_var.get()
        alpha_fe = self.alpha_fe_var.get()
        write_info = self.write_info_var.get()
        overwrite = self.overwrite_var.get()
        single_out = self.out_mode_var.get() == "single"
        base_out = Path(self.out_dir_var.get()) if single_out and self.out_dir_var.get() else None

        total = len(self.file_list)
        done = 0
        failures = 0

        for spr in self.file_list:
            if self.stop_flag.is_set():
                break
            try:
                out_dir = base_out or spr.with_name(spr.stem + "_out")

                # 덮어쓰기 옵션: off면 기존 파일 있으면 건너뜀
                if not overwrite and out_dir.exists() and any(out_dir.glob(f"{spr.stem}_*.{fmt}")):
                    self.log(f"[SKIP] {spr.name} → already exists in {out_dir.name}")
                else:
                    count, outp = decode_spr_to_images(
                        spr_path=spr,
                        out_root=out_dir if single_out else None,
                        palette_name=pal,
                        fmt=fmt,
                        make_transparent_fe=alpha_fe,
                        write_info_txt=write_info,
                    )
                    self.log(f"[OK] {spr.name}: {count} frames → {outp}")
            except Exception as e:
                failures += 1
                self.log(f"[ERR] {spr.name}: {e}")
            finally:
                done += 1
                self.progress.configure(value=done)

        self.log(f"완료: {done}/{total}, 실패 {failures}")
        if self.stop_flag.is_set():
            self.log("사용자 중단됨.")

# ====== main ======
if __name__ == "__main__":
    App().mainloop()
