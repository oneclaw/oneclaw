#!/usr/bin/env python3
"""
Morph PPT Build Template
Copy this file, rename it to build.py, and adapt it to your deck.

Usage:
  python3 build.py

Requirements:
  - officecli must be available in PATH
  - morph-helpers.py must be at {SKILL_DIR}/reference/morph-helpers.py
"""
import subprocess, sys, os, signal

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

# Scene actors -- !!scene-* persist across the entire deck
run("officecli", "add", OUTPUT, "/slide[1]", "--type", "shape",
    "--prop", "name=!!scene-ring", "--prop", "preset=ellipse", "--prop", "fill=E94560",
    "--prop", "opacity=0.3", "--prop", "x=5cm", "--prop", "y=3cm",
    "--prop", "width=8cm", "--prop", "height=8cm")
run("officecli", "add", OUTPUT, "/slide[1]", "--type", "shape",
    "--prop", "name=!!scene-dot", "--prop", "preset=ellipse", "--prop", "fill=0F3460",
    "--prop", "x=28cm", "--prop", "y=15cm", "--prop", "width=1cm", "--prop", "height=1cm")

# Content shape -- MUST use #s1- prefix so helper("clone", ...) auto-ghosts it on slide 2.
# Titles: use 28-30cm width to avoid text wrapping.
run("officecli", "add", OUTPUT, "/slide[1]", "--type", "shape",
    "--prop", "name=#s1-title", "--prop", "text=Main Title",
    "--prop", "font=Arial Black", "--prop", "size=64", "--prop", "bold=true",
    "--prop", "color=FFFFFF", "--prop", "x=10cm", "--prop", "y=8cm",
    "--prop", "width=28cm", "--prop", "height=3cm", "--prop", "fill=none")

checkpoint()

# ============ SLIDE 2 (within Section A) ============
print("Building Slide 2...")

# Normal transition -- clone auto-sets transition=morph AND auto-ghosts every
# #s1-* shape by name. Do NOT call helper("ghost", ...) for #sN- content.
helper("clone", OUTPUT, 1, 2)

# Add new content for slide 2
run("officecli", "add", OUTPUT, "/slide[2]", "--type", "shape",
    "--prop", "name=#s2-title", "--prop", "text=Second Slide",
    "--prop", "font=Arial Black", "--prop", "size=64", "--prop", "bold=true",
    "--prop", "color=FFFFFF", "--prop", "x=10cm", "--prop", "y=8cm",
    "--prop", "width=28cm", "--prop", "height=3cm", "--prop", "fill=none")

# Adjust scene actors to create motion -- stay in safe zones
run("officecli", "set", OUTPUT, "/slide[2]/shape[1]", "--prop", "x=15cm", "--prop", "y=5cm")  # ring
run("officecli", "set", OUTPUT, "/slide[2]/shape[2]", "--prop", "x=5cm",  "--prop", "y=10cm") # dot

helper("verify", OUTPUT, 2)
checkpoint()

# ============ SLIDE 3 (Section B opener -- SECTION TRANSITION) ============
print("Building Slide 3...")

# Clone auto-ghosts slide 2's #s2-* content by name.
helper("clone", OUTPUT, 2, 3)

# Section transition: clear every !!actor-* carried over from Section A.
# !!scene-* shapes stay (they're persistent decoration).
helper("ghost-section", OUTPUT, 3)

# Add Section B's fresh content
run("officecli", "add", OUTPUT, "/slide[3]", "--type", "shape",
    "--prop", "name=#s3-title", "--prop", "text=Third Slide",
    "--prop", "font=Arial Black", "--prop", "size=64", "--prop", "bold=true",
    "--prop", "color=FFFFFF", "--prop", "x=10cm", "--prop", "y=8cm",
    "--prop", "width=28cm", "--prop", "height=3cm", "--prop", "fill=none")

run("officecli", "set", OUTPUT, "/slide[3]/shape[1]", "--prop", "x=25cm", "--prop", "y=8cm")
run("officecli", "set", OUTPUT, "/slide[3]/shape[2]", "--prop", "x=10cm", "--prop", "y=5cm")

helper("verify", OUTPUT, 3)
checkpoint()

# ============ FINAL SAVE + VERIFICATION ============
run("officecli", "close", OUTPUT)
print()
print("=========================================")
helper("final-check", OUTPUT)
print()
print("Build complete! Open", OUTPUT, "in PowerPoint to see morph animations.")
