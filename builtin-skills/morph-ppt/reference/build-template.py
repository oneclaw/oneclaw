#!/usr/bin/env python3
"""
Morph PPT Build Template
========================
Copy this file, rename to build.py, adapt to your deck.

EXECUTION (CRITICAL — commands WILL BE REJECTED otherwise)
----------------------------------------------------------
  CORRECT:  python3 /absolute/path/to/build.py
  WRONG:    cd /some/dir && python3 build.py     <- exec rejects shell operators
  WRONG:    bash -c "python3 build.py"           <- same reason

The script calls os.chdir() internally. No shell cd is needed.

DO NOT USE `edit` ON THIS FILE — it has hundreds of identical "--prop"
fragments and `edit` requires a unique match. Use `write` to rewrite entirely.

On failure: re-run this script. checkpoint() is idempotent — completed slides
are already saved to disk.

SHAPE NAMING (auto-ghost depends on these — the #1 cause of overlap bugs)
--------------------------------------------------------------------------
  !!scene-{desc}   Background decoration. Persists entire deck. Safe zones only.
                   Examples: !!scene-ring, !!scene-bg-gradient, !!scene-dot
  !!actor-{desc}   Content foreground. Ghost at section boundaries.
                   Examples: !!actor-feature-box, !!actor-metric-card
  #sN-{desc}       Per-slide content (N = slide number it first appears on).
                   Auto-ghosted by helper("clone", ...) on the next slide.
                   Examples: #s1-title, #s2-body, #s3-chart-label

  Hard rules:
  1. Every per-slide shape MUST use #sN- prefix. Without it, clone cannot
     auto-ghost it -> content leaks onto the next slide (overlap bug).
  2. !!scene-* and !!actor-* names must NEVER collide.
     Bad: !!scene-card + !!actor-card. Good: !!scene-card-bg + !!actor-card-content.
  3. Every !!actor-* needs a planned exit — either ghost-section at a section
     boundary, or explicit ghost to x=36cm on a specific slide.
  4. Ghost accumulation is SILENT. A !!actor-* introduced on slide 3 remains
     visible on slides 4, 5, 6... until explicitly ghosted. No error, no warning.
     Screenshot verification in Phase 4 is the only way to catch this.

HELPER COMMANDS
---------------
  helper("clone", OUTPUT, N, N+1)             Clone slide + set transition=morph
                                               + auto-ghost ALL non-persistent shapes
  helper("move", OUTPUT, N, "!!name", ...)    Reposition shape by name — ALWAYS use
                                               this after clone, never /slide[N]/shape[M]
  helper("ghost-section", OUTPUT, N)          Ghost every !!actor-* to x=36cm
                                               (use on first slide of a new section)
  helper("ghost", OUTPUT, N, idx)             Ghost specific shape by index — escape
                                               hatch for one-off actor exits mid-section
  helper("verify", OUTPUT, N)                 Check transition + unghosted content
  helper("final-check", OUTPUT)               Verify all slides from 2..N

  CRITICAL: After clone, NEVER use /slide[N]/shape[M] to reposition shapes.
  Shape indices shift when transition=morph reorders the shape tree — shape[1]
  may point to a ghosted content shape, moving it back on-screen (overlap bug).
  Always use helper("move", ...) which finds the shape by name.

  Do NOT call helper("ghost", ...) for #sN-* content — clone handles it.
"""
import subprocess, sys, os, signal

# Set working directory to the script's own directory so all relative paths
# (OUTPUT, etc.) resolve correctly -- no shell `cd` needed before invocation.
os.chdir(os.path.dirname(os.path.abspath(__file__)))

def run(*args):
    result = subprocess.run(list(args))
    if result.returncode != 0:
        sys.exit(result.returncode)

# Helper bridge into morph-helpers.py
SKILL_DIR = "{baseDir}"
def helper(*args):
    run(sys.executable, os.path.join(SKILL_DIR, "reference", "morph-helpers.py"), *[str(a) for a in args])

OUTPUT = "deck.pptx"

# SIGTERM handler -- silently flush and exit 0 so checkpoints survive and
# the agent doesn't misread the cancellation as a script bug.
def _save_on_kill(signum, frame):
    try:
        subprocess.run(["officecli", "close", OUTPUT],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
    except Exception:
        pass
    print("\nInterrupted -- progress saved to disk. Re-run the same script to rebuild.")
    sys.exit(0)
signal.signal(signal.SIGTERM, _save_on_kill)

def checkpoint():
    """Flush completed slides to disk. Call after finishing each slide."""
    run("officecli", "close", OUTPUT)
    run("officecli", "open", OUTPUT)

# Clean rebuild from scratch
if os.path.exists(OUTPUT):
    os.remove(OUTPUT)
run("officecli", "create", OUTPUT)
run("officecli", "open", OUTPUT)   # Resident mode -- all commands run in memory

# ============ SLIDE 1 (Section A opener) ============
print("Building Slide 1...")
run("officecli", "add", OUTPUT, "/", "--type", "slide")
run("officecli", "set", OUTPUT, "/slide[1]", "--prop", "background=1A1A2E")

# Scene actors -- !!scene-* persist across the entire deck.
# Place them in safe zones only (corners/edges, NOT in content area x=2~28cm, y=3~16cm).
run("officecli", "add", OUTPUT, "/slide[1]", "--type", "shape",
    "--prop", "name=!!scene-ring", "--prop", "preset=ellipse", "--prop", "fill=E94560",
    "--prop", "opacity=0.3", "--prop", "x=5cm", "--prop", "y=3cm",
    "--prop", "width=8cm", "--prop", "height=8cm")
run("officecli", "add", OUTPUT, "/slide[1]", "--type", "shape",
    "--prop", "name=!!scene-dot", "--prop", "preset=ellipse", "--prop", "fill=0F3460",
    "--prop", "x=28cm", "--prop", "y=15cm", "--prop", "width=1cm", "--prop", "height=1cm")

# Per-slide content -- MUST use #s1- prefix so clone auto-ghosts it on slide 2.
# Titles: use 28-30cm width to avoid text wrapping.
run("officecli", "add", OUTPUT, "/slide[1]", "--type", "shape",
    "--prop", "name=#s1-title", "--prop", "text=Main Title",
    "--prop", "font=Arial Black", "--prop", "size=64", "--prop", "bold=true",
    "--prop", "color=FFFFFF", "--prop", "x=10cm", "--prop", "y=8cm",
    "--prop", "width=28cm", "--prop", "height=3cm", "--prop", "fill=none")

checkpoint()

# ============ SLIDE 2 (within Section A) ============
print("Building Slide 2...")

# clone: copies slide 1 → slide 2, sets transition=morph, auto-ghosts ALL
# non-persistent shapes (including unnamed ones). #s1-* content is ghosted by name.
# Do NOT manually ghost #sN-* content — clone handles it.
helper("clone", OUTPUT, 1, 2)

# New content for slide 2 — use #s2- prefix (NOT #s1-).
run("officecli", "add", OUTPUT, "/slide[2]", "--type", "shape",
    "--prop", "name=#s2-title", "--prop", "text=Second Slide",
    "--prop", "font=Arial Black", "--prop", "size=64", "--prop", "bold=true",
    "--prop", "color=FFFFFF", "--prop", "x=10cm", "--prop", "y=8cm",
    "--prop", "width=28cm", "--prop", "height=3cm", "--prop", "fill=none")

# Reposition scene actors to create motion — use helper("move", ...) by name.
# NEVER use /slide[2]/shape[1] — shape indices shift after clone + morph.
helper("move", OUTPUT, 2, "!!scene-ring", "x=15cm", "y=5cm")
helper("move", OUTPUT, 2, "!!scene-dot",  "x=5cm",  "y=10cm")

helper("verify", OUTPUT, 2)
checkpoint()

# ============ SLIDE 3 (Section B opener -- SECTION TRANSITION) ============
print("Building Slide 3...")

# Clone auto-ghosts slide 2's #s2-* content.
helper("clone", OUTPUT, 2, 3)

# SECTION TRANSITION: ghost-section clears every !!actor-* from previous section.
# !!scene-* shapes stay (they're persistent decoration).
helper("ghost-section", OUTPUT, 3)

# Section B's fresh content — use #s3- prefix.
run("officecli", "add", OUTPUT, "/slide[3]", "--type", "shape",
    "--prop", "name=#s3-title", "--prop", "text=Third Slide",
    "--prop", "font=Arial Black", "--prop", "size=64", "--prop", "bold=true",
    "--prop", "color=FFFFFF", "--prop", "x=10cm", "--prop", "y=8cm",
    "--prop", "width=28cm", "--prop", "height=3cm", "--prop", "fill=none")

# Scene actors move to new positions (stay in safe zones).
helper("move", OUTPUT, 3, "!!scene-ring", "x=25cm", "y=8cm")
helper("move", OUTPUT, 3, "!!scene-dot",  "x=10cm", "y=5cm")

helper("verify", OUTPUT, 3)
checkpoint()

# ============ FINAL SAVE + VERIFICATION ============
run("officecli", "close", OUTPUT)
print()
print("=========================================")
helper("final-check", OUTPUT)
print()
print("Build complete! Open", OUTPUT, "in PowerPoint to see morph animations.")
