# Render V2 Optimization and Pipeline Logic

This document provides a comprehensive overview of the Render Studio V2 engine, covering track optimizations, the high-speed "Copy Path", and the standard segmented rendering pipeline.

---

## 1. Global Pipeline Flow (The Big Picture)

When a render task starts in `runRenderV2Task`, it follows this decision tree:

1.  **Path Decision**:
    *   Check `checkCopyPathEligibility()`.
    *   If **Full** or **Hybrid** mode: Run **Single-Pass Render** (Skip steps 2-4).
    *   If **None** mode: Run **Standard Segmented Pipeline** (Proceed to steps 2-4).

2.  **Standard Pipeline - Phase 1: Measurement**:
    *   Scan all audio tracks to measure LUFS if `levelControl='lufs'` is used.
    *   Cache results in `lufsCache` to avoid redundant FFmpeg passes.

3.  **Standard Pipeline - Phase 2: Segmentation & Cache**:
    *   Calculate a unique `signature` based on the configuration.
    *   Divide the timeline into segments (e.g., 300s each).
    *   For each segment:
        *   Check if a cached `.mp4` exists for this signature + segment index.
        *   If not, render the segment using `buildRenderV2FilterGraph` + re-encoding.

4.  **Standard Pipeline - Phase 3: Concatenation**:
    *   Once all segments are ready, generate a `concat.txt` list.
    *   Run FFmpeg `concat demuxer` to merge segments into the final file without re-encoding the segments themselves.

---

## 2. Track-Level Optimization (Filtering)

Before any path (Copy or Standard) begins, tracks that do not contribute to the final output are filtered out to save CPU and IO.

| Track Type | Skipped When |
|---|---|
| Video, Image, Subtitle, Text | `visible: false` |
| Audio | `mute: true` |
| Video (audio stream only) | `visible: false` OR `mute: true` |

**Log Output Example:**
```text
[RenderV2] Optimization: 2 tracks used, 1 skipped.
[RenderV2] Used tracks: Main Video [video] (muted), Background Music [audio]
[RenderV2] Skipped tracks: Old Narration [audio] (muted)
```

---

## 3. Copy Fast-Path (The 3 Modes)

The "Copy Path" is triggered only for simple 1-video + 1-audio renders with no transforms.

### Mode Selection Logic
| Mode | Action | Speed | Note |
|---|---|---|---|
| **FULL** | `-c:v copy -c:a copy` | ~100x | Fully lossless. No processing on either stream. |
| **HYBRID** | `-c:v copy -c:a aac` | ~10-20x | Video is lossless. Audio is processed (Gain/LUFS/Fade) and re-encoded. |
| **NONE** | Standard Pipeline | Normal | Triggered if video has transforms, trims, or there are overlays. |

### Eligibility (The 10-Point Check)
1.  **Export Mode**: Must be `video+audio`.
2.  **Track Count**: Exactly 1 visible muted video + 1 active audio.
3.  **No Overlays**: No visible images, subtitles, or text tracks.
4.  **Identity Transform**: No scale, rotation, opacity change, mirror, crop, or effects.
5.  **Video Timeline**: No trim or start offset (must be raw full duration).
6.  **Audio Timeline**: No trim or start offset (must be raw full duration).
7.  **Output Alignment**: `outputStart` must be 0 (no seeking into the middle).
8.  **File Resolution**: Source files must exist on disk.
9.  **Known Duration**: `timeline.duration` must be positive.
10. **Audio Processing**: If any Gain/LUFS/Fade exists, mode is downgraded from `FULL` to `HYBRID`.

---

## 4. Standard Pipeline Details

If the task falls into **NONE** mode (e.g., because you added a text overlay), the system uses the full power of the segmented pipeline.

### Why Segmentation?
- **Caching**: If you change only the last 10 seconds of a 1-hour video, only the last segment needs to be re-rendered. The first 50 minutes are pulled instantly from the cache.
- **Stability**: If the server crashes, it can resume from the last completed segment.

### The Filter Graph (`buildRenderV2FilterGraph`)
In standard mode, a complex filter graph is built:
- **Video**: `[0:v]scale=...[v_scaled]; [v_scaled][1:v]overlay=...[v_final]`
- **Audio**: `[0:a]volume=...[a0]; [1:a]volume=...[a1]; [a0][a1]amix=...[a_mixed]; [a_mixed]loudnorm=...[aout]`

---

## 5. Summary of Experience & Lessons Learned

- **Segmentation Conflict**: Initially, "Copy" was attempted per-segment. This caused "Keyframe Misalignment" (black frames or jitter at segment joins) because you cannot accurately cut a stream-copied video at arbitrary timestamps. **Solution**: Copy path now always bypasses segments and runs as a single pass.
- **Hybrid Efficiency**: We realized that re-encoding audio is extremely cheap compared to video. By allowing "Hybrid Copy", we can still offer 10x speedups even when users want volume normalization (LUFS).
- **Log Transparency**: Providing step-by-step `✓/✗` logs ensures that users (and developers) understand why a specific optimization was or wasn't applied.
