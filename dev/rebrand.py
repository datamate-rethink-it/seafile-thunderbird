#!/usr/bin/env python3
"""
Rebrand the Seafile Thunderbird extension.

Replaces user-visible branding (name, URL, icons, extension ID) while
keeping all technical code, API paths, and class names unchanged.

Usage:
    python3 dev/rebrand.py --name "Speicherbox" --url "https://www.speicherbox.de" --id "speicherbox@speicherbox.de"

Optional:
    --icons-dir path/to/icons/   Directory containing icon-16.png, icon-32.png, icon-64.png, seafile-logo.svg
    --placeholder-url "https://cloud.speicherbox.de"   URL shown in the server URL input field (defaults to --url)
    --dry-run                    Show what would be changed without modifying files
"""

import argparse
import json
import shutil
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent


def replace_in_file(path, replacements, dry_run=False):
    """Apply a list of (old, new) replacements to a file. Returns count of changes."""
    content = path.read_text(encoding="utf-8")
    original = content
    count = 0
    for old, new in replacements:
        occurrences = content.count(old)
        if occurrences > 0:
            content = content.replace(old, new)
            count += occurrences
    if content != original and not dry_run:
        path.write_text(content, encoding="utf-8")
    return count


def rebrand_locales(name, dry_run=False):
    """Replace 'Seafile' in all locale message values."""
    total = 0
    for locale_file in sorted(REPO_ROOT.glob("_locales/*/messages.json")):
        with open(locale_file, encoding="utf-8") as f:
            data = json.load(f)
        changes = 0
        for key, entry in data.items():
            msg = entry.get("message", "")
            if "Seafile" in msg:
                entry["message"] = msg.replace("Seafile", name)
                changes += 1
        if changes > 0 and not dry_run:
            with open(locale_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                f.write("\n")
        if changes > 0:
            lang = locale_file.parent.name
            print(f"  _locales/{lang}/messages.json: {changes} strings updated")
            total += changes
    return total


def rebrand_background_js(name, url, dry_run=False):
    """Replace user-visible branding in background.js."""
    path = REPO_ROOT / "background.js"
    replacements = [
        # Notification title
        ('title: "Seafile"', f'title: "{name}"'),
        # CloudFile service info
        ('service_name: "Seafile"', f'service_name: "{name}"'),
        ('service_url: "https://www.seafile.com"', f'service_url: "{url}"'),
        # Fallback strings (after || in getMessage calls)
        ('"Seafile account not connected', f'"{name} account not connected'),
        ('"Seafile account not fully configured', f'"{name} account not fully configured'),
        ('"No Seafile account configured."', f'"No {name} account configured."'),
        ('to Seafile server."', f'to {name} server."'),
        # Email template
        ('alt="Seafile"', f'alt="{name}"'),
        ('>Seafile</div>', f'>{name}</div>'),
        ('>Seafile</a>', f'>{name}</a>'),
        ('href="https://www.seafile.com"', f'href="{url}"'),
    ]
    count = replace_in_file(path, replacements, dry_run)
    if count > 0:
        print(f"  background.js: {count} replacements")
    return count


def rebrand_management_html(placeholder_url, dry_run=False):
    """Replace the placeholder URL in the server URL input field."""
    path = REPO_ROOT / "management" / "management.html"
    replacements = [
        ('placeholder="https://cloud.seafile.com"', f'placeholder="{placeholder_url}"'),
    ]
    count = replace_in_file(path, replacements, dry_run)
    if count > 0:
        print(f"  management/management.html: {count} replacements")
    return count


def rebrand_manifest(extension_id, dry_run=False):
    """Replace the extension ID in manifest.json."""
    path = REPO_ROOT / "manifest.json"
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    old_id = data["browser_specific_settings"]["gecko"]["id"]
    if old_id == extension_id:
        return 0
    data["browser_specific_settings"]["gecko"]["id"] = extension_id
    if not dry_run:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
    print(f"  manifest.json: extension ID '{old_id}' → '{extension_id}'")
    return 1


def copy_icons(icons_dir, dry_run=False):
    """Copy custom icons from a directory."""
    icons_dir = Path(icons_dir)
    expected = ["icon-16.png", "icon-32.png", "icon-64.png", "seafile-logo.svg"]
    count = 0
    for icon in expected:
        src = icons_dir / icon
        dst = REPO_ROOT / "icons" / icon
        if src.exists():
            if not dry_run:
                shutil.copy2(src, dst)
            print(f"  icons/{icon}: copied from {src}")
            count += 1
        else:
            print(f"  icons/{icon}: not found in {icons_dir} (skipped)")
    return count


def verify(name):
    """Check for remaining 'Seafile' in user-visible strings."""
    warnings = []

    # Check locale files
    for locale_file in sorted(REPO_ROOT.glob("_locales/*/messages.json")):
        with open(locale_file, encoding="utf-8") as f:
            data = json.load(f)
        for key, entry in data.items():
            if "Seafile" in entry.get("message", ""):
                lang = locale_file.parent.name
                warnings.append(f"  _locales/{lang}/messages.json: key '{key}' still contains 'Seafile'")

    # Check background.js user-visible strings (not code identifiers)
    bg = (REPO_ROOT / "background.js").read_text(encoding="utf-8")
    for i, line in enumerate(bg.splitlines(), 1):
        # Skip lines with code identifiers (SeafileAPI, seafile., class names)
        if any(x in line for x in ["SeafileAPI", "seafile.", "seafile-", "console.", " * "]):
            continue
        if '"Seafile' in line or "'Seafile" in line or ">Seafile<" in line:
            warnings.append(f"  background.js:{i}: may still contain 'Seafile'")

    return warnings


def main():
    parser = argparse.ArgumentParser(description="Rebrand the Seafile Thunderbird extension")
    parser.add_argument("--name", required=True, help="Brand name (e.g. 'Speicherbox')")
    parser.add_argument("--url", required=True, help="Brand website URL (e.g. 'https://www.speicherbox.de')")
    parser.add_argument("--id", required=True, help="Extension ID (e.g. 'speicherbox@speicherbox.de')")
    parser.add_argument("--icons-dir", help="Directory with custom icons (icon-16.png, icon-32.png, icon-64.png, seafile-logo.svg)")
    parser.add_argument("--placeholder-url", help="Placeholder URL for server URL field (defaults to --url)")
    parser.add_argument("--dry-run", action="store_true", help="Show changes without modifying files")
    args = parser.parse_args()

    placeholder_url = args.placeholder_url or args.url

    if args.dry_run:
        print("DRY RUN — no files will be modified\n")

    print(f"Rebranding: Seafile → {args.name}")
    print(f"URL: https://www.seafile.com → {args.url}")
    print(f"Extension ID: → {args.id}")
    print()

    total = 0

    print("Locale files:")
    total += rebrand_locales(args.name, args.dry_run)

    print("\nCode files:")
    total += rebrand_background_js(args.name, args.url, args.dry_run)
    total += rebrand_management_html(placeholder_url, args.dry_run)

    print("\nManifest:")
    total += rebrand_manifest(args.id, args.dry_run)

    if args.icons_dir:
        print("\nIcons:")
        total += copy_icons(args.icons_dir, args.dry_run)

    print(f"\nTotal: {total} changes")

    if args.dry_run:
        print("\nRe-run without --dry-run to apply changes.")
    else:
        # Verify only after actual changes
        warnings = verify(args.name)
        if warnings:
            print(f"\n⚠ Remaining 'Seafile' references found ({len(warnings)}):")
            for w in warnings:
                print(w)
            print("\nThese may need manual review.")
        else:
            print("\n✓ No remaining 'Seafile' references in user-visible strings.")


if __name__ == "__main__":
    main()
