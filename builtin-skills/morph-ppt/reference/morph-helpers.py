#!/usr/bin/env python3
"""
Morph PPT Helper Functions
Cross-platform replacement for morph-helpers.sh (Mac / Windows / Linux)

Usage (CLI):
  python3 morph-helpers.py clone <deck> <from_slide> <to_slide>
  python3 morph-helpers.py ghost <deck> <slide> <idx> [idx ...]
  python3 morph-helpers.py ghost-section <deck> <slide>
  python3 morph-helpers.py verify <deck> <slide>
  python3 morph-helpers.py final-check <deck>

Usage (import):
  from morph_helpers import (
      morph_clone_slide, morph_ghost_content, morph_ghost_section,
      morph_verify_slide, morph_final_check,
  )
"""

import sys
import json
import subprocess
import argparse
import re

# Cross-platform color support (colorama optional)
try:
    from colorama import init, Fore, Style
    init(autoreset=True)
    GREEN  = Fore.GREEN
    RED    = Fore.RED
    YELLOW = Fore.YELLOW
    BLUE   = Fore.CYAN
    NC     = Style.RESET_ALL
except ImportError:
    GREEN = RED = YELLOW = BLUE = NC = ""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _run(*args):
    """Run a command, return (returncode, stdout, stderr)."""
    result = subprocess.run(list(args), capture_output=True, text=True)
    return result.returncode, result.stdout, result.stderr


def _find_nested(data, key):
    """Recursively search a nested dict for a key, return its value or None."""
    if isinstance(data, dict):
        if key in data:
            return data[key]
        for v in data.values():
            found = _find_nested(v, key)
            if found is not None:
                return found
    return None


def _has_morph_transition(json_str):
    """Check whether JSON output from officecli contains transition=morph."""
    if '"transition": "morph"' in json_str:
        return True
    try:
        data = json.loads(json_str)
        return _find_nested(data, "transition") == "morph"
    except Exception:
        return False


def _collect_shapes(children, callback):
    """Walk a shape tree depth-first, calling callback(child) for each node."""
    for child in children:
        callback(child)
        if "Children" in child:
            _collect_shapes(child["Children"], callback)


# ---------------------------------------------------------------------------
# morph_clone_slide
# ---------------------------------------------------------------------------

def _collect_matching_paths(data, name_predicate):
    """Walk a slide JSON tree and return Path for every shape whose name matches.

    name_predicate: callable(name:str) -> bool
    """
    hits = []

    def visit(child):
        name = child.get("Format", {}).get("name", "") or ""
        path = child.get("Path", "")
        if path and name_predicate(name):
            hits.append((path, name))

    if "Children" in data:
        _collect_shapes(data["Children"], visit)
    return hits


def _ghost_by_paths(deck, hits):
    """Move each (path, name) shape off-screen to x=36cm. Returns list of ghosted names."""
    ghosted = []
    for path, name in hits:
        rc, _, _ = _run("officecli", "set", deck, path, "--prop", "x=36cm")
        if rc == 0:
            ghosted.append(name)
            print(f"{GREEN}  Ghosted {name} ({path}){NC}")
        else:
            print(f"{RED}  Failed to ghost {name} ({path}){NC}")
    return ghosted


def _is_persistent_shape(name):
    """Return True if shape is a persistent !!scene- or !!actor- (should NOT be auto-ghosted on clone).

    Uses substring match to handle the !! auto-prefix that officecli prepends
    after transition=morph (e.g. !!scene-ring -> !!!!scene-ring on clone).
    """
    return "!!scene-" in name or "!!actor-" in name


def morph_clone_slide(deck, from_slide, to_slide):
    """Clone slide, set transition=morph, auto-ghost all non-persistent content, verify.

    Auto-ghost behavior: after the clone, every shape on the new slide that is
    NOT a persistent ``!!scene-*`` or ``!!actor-*`` shape is moved off-screen to
    x=36cm. This catches properly named ``#sN-*`` content as well as any shapes
    with incorrect or missing naming — preventing the overlap bug where previous
    slide content leaks through.

    Note: ``!!scene-*`` and ``!!actor-*`` shapes are NOT auto-ghosted here.
    Persistent scene actors are the whole point of morph. To clear content actors
    at a section boundary, call morph_ghost_section() right after this.

    Args:
        deck:       path to .pptx file
        from_slide: source slide number (1-based)
        to_slide:   destination slide number (1-based)
    """
    from_slide, to_slide = int(from_slide), int(to_slide)

    print(f"{BLUE}Cloning slide {from_slide} -> {to_slide}...{NC}")
    _run("officecli", "add", deck, "/", "--from", f"/slide[{from_slide}]")

    print(f"{BLUE}Setting morph transition...{NC}")
    _run("officecli", "set", deck, f"/slide[{to_slide}]", "--prop", "transition=morph")

    # Auto-ghost ALL non-persistent content on the cloned slide.
    # Old behaviour only looked for #s{from_slide}- prefix, which silently
    # missed shapes with wrong/missing prefix — the #1 cause of overlap.
    # New behaviour: ghost every shape (named or unnamed) that is NOT !!scene-* or !!actor-*.
    print(f"{BLUE}Auto-ghosting content shapes on slide {to_slide}...{NC}")
    rc, out, _ = _run("officecli", "get", deck, f"/slide[{to_slide}]", "--json")
    curr_json_str = out
    try:
        curr_data = json.loads(curr_json_str).get("data", {})
    except Exception:
        curr_data = {}

    hits = _collect_matching_paths(curr_data, lambda n: not _is_persistent_shape(n))
    if hits:
        _ghost_by_paths(deck, hits)
        print(f"{GREEN}  Auto-ghosted {len(hits)} content shape(s) on slide {to_slide}{NC}")
    else:
        print(f"{YELLOW}  No non-persistent shapes found on slide {to_slide} to ghost.{NC}")

    # Verify transition actually landed.
    print(f"{BLUE}Verifying transition...{NC}")
    if not _has_morph_transition(curr_json_str):
        # Re-fetch in case the auto-ghost writes invalidated the cached JSON.
        rc, out, _ = _run("officecli", "get", deck, f"/slide[{to_slide}]", "--json")
        if not _has_morph_transition(out):
            print(f"{RED}ERROR: Transition not set on slide {to_slide}!{NC}")
            print(f"{RED}   This slide will not have morph animation.{NC}")
            sys.exit(1)

    print(f"{GREEN}Transition verified on slide {to_slide}{NC}")
    print()


# ---------------------------------------------------------------------------
# morph_ghost_content
# ---------------------------------------------------------------------------

def morph_ghost_content(deck, slide, *shapes):
    """Move shapes off-screen (x=36cm) to ghost them for morph animation.

    Args:
        deck:     path to .pptx file
        slide:    slide number (1-based)
        *shapes:  one or more shape indices to ghost
    """
    slide = int(slide)
    shapes = [int(s) for s in shapes]

    if not shapes:
        print(f"{YELLOW}No shapes to ghost{NC}")
        return

    print(f"{BLUE}Ghosting {len(shapes)} content shape(s) on slide {slide}...{NC}")
    for idx in shapes:
        rc, _, _ = _run("officecli", "set", deck, f"/slide[{slide}]/shape[{idx}]", "--prop", "x=36cm")
        if rc == 0:
            print(f"{GREEN}  Ghosted shape[{idx}]{NC}")
        else:
            print(f"{RED}  Failed to ghost shape[{idx}]{NC}")

    print(f"{GREEN}Ghosting complete{NC}")
    print()


# ---------------------------------------------------------------------------
# morph_ghost_section
# ---------------------------------------------------------------------------

def morph_ghost_section(deck, slide):
    """Clear all !!actor-* content actors on a slide — use at section transitions.

    Moves every shape whose name starts with ``!!actor-`` to x=36cm. Leaves
    ``!!scene-*`` (persistent decoration) and ``#sN-*`` (handled by clone's
    auto-ghost) untouched. Safe to call on a freshly-cloned slide before adding
    the new section's content.

    Args:
        deck:  path to .pptx file
        slide: slide number (1-based) — typically the first slide of a new section
    """
    slide = int(slide)

    print(f"{BLUE}Ghosting !!actor-* content on slide {slide} (section transition)...{NC}")
    rc, out, _ = _run("officecli", "get", deck, f"/slide[{slide}]", "--json")
    try:
        curr_data = json.loads(out).get("data", {})
    except Exception:
        print(f"{RED}  Failed to read slide {slide}{NC}")
        sys.exit(1)

    hits = _collect_matching_paths(curr_data, lambda n: n.startswith("!!actor-"))
    if not hits:
        print(f"{YELLOW}  No !!actor-* shapes on slide {slide} — nothing to ghost{NC}")
        print()
        return

    _ghost_by_paths(deck, hits)
    print(f"{GREEN}  Section-cleared {len(hits)} actor(s) on slide {slide}{NC}")
    print()


# ---------------------------------------------------------------------------
# morph_move_shape
# ---------------------------------------------------------------------------

def morph_move_shape(deck, slide, name, *prop_args):
    """Find a shape by name and set properties — safe alternative to index-based access.

    After ``helper("clone", ...)``, shape indices are UNRELIABLE because
    ``transition=morph`` may reorder shapes. This function reads the slide JSON,
    locates the shape by **substring match** on its name (tolerating the ``!!``
    prefix that officecli prepends on morph slides), and issues the ``set``
    command using the correct index-based path.

    Args:
        deck:       path to .pptx file
        slide:      slide number (1-based)
        name:       shape name to match (e.g. ``!!scene-ring``). Uses substring
                    match so ``!!scene-ring`` finds both ``!!scene-ring`` and
                    ``!!!!scene-ring``.
        *prop_args: one or more ``key=value`` strings passed to ``--prop``
                    (e.g. ``"x=15cm"``, ``"y=5cm"``)
    """
    slide = int(slide)

    if not prop_args:
        print(f"{RED}ERROR: move requires at least one property{NC}")
        sys.exit(1)

    rc, out, _ = _run("officecli", "get", deck, f"/slide[{slide}]", "--json")
    try:
        data = json.loads(out).get("data", {})
    except Exception:
        print(f"{RED}ERROR: Failed to read slide {slide}{NC}")
        sys.exit(1)

    hits = _collect_matching_paths(data, lambda n: name in n)
    if not hits:
        print(f"{RED}ERROR: Shape '{name}' not found on slide {slide}{NC}")
        sys.exit(1)

    path, matched_name = hits[0]
    cmd = ["officecli", "set", deck, path]
    for prop in prop_args:
        cmd.extend(["--prop", prop])
    rc, _, _ = _run(*cmd)
    if rc != 0:
        print(f"{RED}ERROR: Failed to set properties on {matched_name} ({path}){NC}")
        sys.exit(1)
    print(f"{GREEN}  Moved {matched_name} ({path}) — {', '.join(prop_args)}{NC}")


# ---------------------------------------------------------------------------
# morph_verify_slide
# ---------------------------------------------------------------------------

def _check_unghosted(data, current_slide):
    """Return list of non-persistent shapes that are visible and don't belong to current_slide.

    Catches:
      - #sN-* content where N != current_slide (stale content from ANY previous slide)
      - Named shapes without #sN-/!!scene-/!!actor- prefix (improperly named content)
    """
    unghosted = []

    def visit(child):
        name = child.get("Format", {}).get("name", "") or ""
        x    = child.get("Format", {}).get("x", "") or ""
        path = child.get("Path", "") or ""
        if not name:
            # Unnamed shapes should also be ghosted; flag if visible
            if x and x != "36cm":
                unghosted.append(f"{path}: name=(unnamed), x={x}")
            return
        # Persistent shapes are expected to stay visible
        if _is_persistent_shape(name):
            return
        # Current slide's own content is expected to be visible
        if f"#s{current_slide}-" in name:
            return
        # Everything else should be at x=36cm (ghosted)
        if x != "36cm":
            unghosted.append(f"{path}: name={name}, x={x}")

    if "Children" in data:
        _collect_shapes(data["Children"], visit)
    return unghosted


def _check_duplicates(prev_data, curr_data):
    """Return list of shapes with identical text+position on adjacent slides (excluding ghost zone)."""
    # Pure decoration primitives only. "actor" is intentionally NOT in this list —
    # !!actor-* shapes carry slide-specific content and must be checked for duplicates
    # across section boundaries.
    SCENE_KEYWORDS = ["ring", "dot", "line", "circle", "rect", "slash",
                      "accent", "star", "triangle", "diamond"]

    def extract(data):
        boxes = []

        def visit(child):
            if child.get("Type") != "textbox":
                return
            name = child.get("Format", {}).get("name", "")
            text = child.get("Text", "").strip()
            x    = child.get("Format", {}).get("x", "")
            y    = child.get("Format", {}).get("y", "")
            path = child.get("Path", "")

            if not text or len(text) < 6:
                return

            clean = name.replace("!!", "")
            is_scene = any(kw in clean.lower() for kw in SCENE_KEYWORDS)
            has_slide_pattern = any(f"s{i}-" in clean for i in range(1, 20))

            if has_slide_pattern or not is_scene:
                boxes.append({"path": path, "text": text[:50], "x": x, "y": y})

        if "Children" in data:
            _collect_shapes(data["Children"], visit)
        return boxes

    prev_boxes = extract(prev_data)
    curr_boxes = extract(curr_data)

    duplicates = []
    for curr in curr_boxes:
        for prev in prev_boxes:
            if (curr["text"] == prev["text"]
                    and curr["x"] == prev["x"]
                    and curr["y"] == prev["y"]
                    and curr["x"] != "36cm"):
                duplicates.append(
                    f"{curr['path']}: text='{curr['text']}...', pos=({curr['x']},{curr['y']})"
                )
                break
    return duplicates


def morph_verify_slide(deck, slide):
    """Verify a slide has correct morph setup (transition + ghosting).

    Uses two detection methods:
      1. Name-based: shapes with #s{prev}- prefix must be at x=36cm
      2. Duplicate text: same text+position on adjacent slides (catches missing # prefix)

    Args:
        deck:  path to .pptx file
        slide: slide number (1-based)

    Returns:
        True if all checks pass, False otherwise.
    """
    slide = int(slide)
    print(f"{BLUE}Verifying slide {slide}...{NC}")
    has_error = False

    # --- Check transition ---
    rc, out, _ = _run("officecli", "get", deck, f"/slide[{slide}]", "--json")
    curr_json_str = out

    if not _has_morph_transition(curr_json_str):
        print(f"{RED}  Missing transition=morph{NC}")
        print(f"{RED}     Without this, slide will not animate!{NC}")
        has_error = True
    else:
        print(f"{GREEN}  Transition OK{NC}")

    # --- Check for any stale (unghosted) content ---
    prev_slide = slide - 1
    if prev_slide >= 1:
        try:
            curr_data = json.loads(curr_json_str).get("data", {})

            # Detect any non-persistent shape that should be ghosted but isn't
            unghosted = _check_unghosted(curr_data, slide)
            if unghosted:
                print(f"{YELLOW}  Warning: Found unghosted content on slide {slide}:{NC}")
                for item in unghosted:
                    print(f"     {item}")
                print(f"{YELLOW}     These shapes should be ghosted to x=36cm{NC}")
                has_error = True
            else:
                print(f"{GREEN}  No unghosted content detected{NC}")
        except Exception:
            print(f"{GREEN}  No unghosted content detected{NC}")

        # Method 2: duplicate text/position detection (backup for missing # prefix)
        try:
            rc2, out2, _ = _run("officecli", "get", deck, f"/slide[{prev_slide}]", "--json")
            prev_data = json.loads(out2).get("data", {})
            curr_data = json.loads(curr_json_str).get("data", {})

            duplicates = _check_duplicates(prev_data, curr_data)
            if duplicates:
                print(f"{YELLOW}  Warning: Found duplicate content from slide {prev_slide} (same text at same position):{NC}")
                for dup in duplicates:
                    print(f"     {dup}")
                print(f"{YELLOW}     This might indicate:{NC}")
                print(f"{YELLOW}     1. Content shapes missing '#sN-' prefix (can't detect for ghosting){NC}")
                print(f"{YELLOW}     2. Forgot to ghost previous slide's content{NC}")
                print(f"{YELLOW}     3. Forgot to add new content for this slide{NC}")
                has_error = True
        except Exception:
            pass

    if not has_error:
        print(f"{GREEN}Slide {slide} verification passed{NC}")
    else:
        print(f"{RED}Slide {slide} has issues - see above{NC}")

    print()
    return not has_error


# ---------------------------------------------------------------------------
# morph_final_check
# ---------------------------------------------------------------------------

def morph_final_check(deck):
    """Verify the entire deck: all slides (2+) must pass morph_verify_slide.

    Args:
        deck: path to .pptx file

    Returns:
        True if all slides pass, False otherwise.
    """
    print(f"{BLUE}Final deck verification...{NC}")
    print()

    rc, out, _ = _run("officecli", "view", deck, "outline")
    total_slides = 0
    first_line = out.split("\n")[0] if out else ""
    match = re.search(r"(\d+)\s+slides", first_line)
    if match:
        total_slides = int(match.group(1))

    if total_slides == 0:
        print(f"{RED}No slides found in deck{NC}")
        return False

    print(f"Total slides: {total_slides}")
    print()

    error_count = 0
    for i in range(2, total_slides + 1):
        if not morph_verify_slide(deck, i):
            error_count += 1

    print("=========================================")
    if error_count == 0:
        print(f"{GREEN}All slides verified successfully!{NC}")
        print(f"{GREEN}   Your morph animations should work correctly.{NC}")
        return True
    else:
        print(f"{RED}Found issues in {error_count} slide(s){NC}")
        print(f"{RED}   Please fix the issues above before delivering.{NC}")
        return False


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        prog="morph-helpers.py",
        description="Morph PPT Helper Functions — cross-platform (Mac / Windows / Linux)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
commands:
  clone <deck> <from_slide> <to_slide>        Clone + morph transition + auto-ghost #s<from>- content
  move <deck> <slide> <name> <prop> [...]     Find shape by name, set props (safe index lookup)
  ghost <deck> <slide> <idx> [idx ...]        Ghost specific shapes by index (escape hatch)
  ghost-section <deck> <slide>                Ghost all !!actor-* on this slide (section transition)
  verify <deck> <slide>                       Verify slide setup (transition + ghosting)
  final-check <deck>                          Verify entire deck

example:
  python3 morph-helpers.py clone         deck.pptx 1 2
  python3 morph-helpers.py ghost-section deck.pptx 3
  python3 morph-helpers.py move         deck.pptx 2 "!!scene-ring" "x=15cm" "y=5cm"
  python3 morph-helpers.py ghost         deck.pptx 2 7 8 9
  python3 morph-helpers.py verify        deck.pptx 2
  python3 morph-helpers.py final-check   deck.pptx
""",
    )
    sub = parser.add_subparsers(dest="command")

    p = sub.add_parser("clone")
    p.add_argument("deck")
    p.add_argument("from_slide", type=int)
    p.add_argument("to_slide",   type=int)

    p = sub.add_parser("move")
    p.add_argument("deck")
    p.add_argument("slide", type=int)
    p.add_argument("name")
    p.add_argument("props", nargs="+")

    p = sub.add_parser("ghost")
    p.add_argument("deck")
    p.add_argument("slide",  type=int)
    p.add_argument("shapes", nargs="+", type=int)

    p = sub.add_parser("ghost-section")
    p.add_argument("deck")
    p.add_argument("slide", type=int)

    p = sub.add_parser("verify")
    p.add_argument("deck")
    p.add_argument("slide", type=int)

    p = sub.add_parser("final-check")
    p.add_argument("deck")

    args = parser.parse_args()

    if args.command == "clone":
        morph_clone_slide(args.deck, args.from_slide, args.to_slide)
    elif args.command == "move":
        morph_move_shape(args.deck, args.slide, args.name, *args.props)
    elif args.command == "ghost":
        morph_ghost_content(args.deck, args.slide, *args.shapes)
    elif args.command == "ghost-section":
        morph_ghost_section(args.deck, args.slide)
    elif args.command == "verify":
        if not morph_verify_slide(args.deck, args.slide):
            sys.exit(1)
    elif args.command == "final-check":
        if not morph_final_check(args.deck):
            sys.exit(1)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
