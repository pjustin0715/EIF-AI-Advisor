import re
from dataclasses import dataclass

import tiktoken

from config import get_settings


@dataclass
class Chunk:
    chunk_index: int
    heading: str
    content: str


def _count_tokens(text: str) -> int:
    try:
        enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))
    except Exception:
        return len(text.split())


def _split_by_headings(text: str) -> list[tuple[str, str]]:
    lines = text.splitlines()
    sections: list[tuple[str, str]] = []
    current_heading = "Introduction"
    current_lines: list[str] = []

    heading_pattern = re.compile(r"^(#{1,3}\s+|\d+\.\s+|[A-Z][A-Za-z\s]{2,40}:$)")

    for line in lines:
        stripped = line.strip()
        if heading_pattern.match(stripped) and len(stripped) < 80:
            if current_lines:
                sections.append((current_heading, "\n".join(current_lines).strip()))
            current_heading = stripped.rstrip(":")
            current_lines = []
        else:
            current_lines.append(line)

    if current_lines:
        sections.append((current_heading, "\n".join(current_lines).strip()))

    if not sections and text.strip():
        sections.append(("Introduction", text.strip()))

    return sections


def chunk_document(text: str) -> list[Chunk]:
    settings = get_settings()
    target = settings.chunk_target_tokens
    overlap = settings.chunk_overlap_tokens
    sections = _split_by_headings(text)
    chunks: list[Chunk] = []
    chunk_index = 0

    for heading, body in sections:
        if not body:
            continue

        words = body.split()
        if not words:
            continue

        start = 0
        while start < len(words):
            end = start
            piece_words: list[str] = []
            while end < len(words):
                candidate = " ".join(piece_words + [words[end]])
                if _count_tokens(candidate) > target and piece_words:
                    break
                piece_words.append(words[end])
                end += 1
                if _count_tokens(" ".join(piece_words)) >= target:
                    break

            content = " ".join(piece_words).strip()
            if content:
                chunks.append(
                    Chunk(chunk_index=chunk_index, heading=heading, content=content)
                )
                chunk_index += 1

            if end >= len(words):
                break
            overlap_words = max(1, overlap // 4)
            start = max(start + 1, end - overlap_words)

    return chunks
