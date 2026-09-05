#!/usr/bin/env python3
"""Generate ChazorAI.xcodeproj from the source tree.

The project file is checked in so the repository can be opened and built with no extra
tooling, but a hand-maintained pbxproj rots. This script regenerates it from what is
actually on disk, which makes "add a file" a one-command operation and keeps the diff
readable when files move.

    python3 Tools/generate_xcodeproj.py

Object IDs are derived from a hash of each object's path, so regenerating after an
unrelated change produces an identical file instead of a churned one.
"""

from __future__ import annotations

import hashlib
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_NAME = "ChazorAI"
TEST_TARGET_NAME = "ChazorAITests"
BUNDLE_ID = "ai.chazor.ChazorAI"
DEPLOYMENT_TARGET = "17.0"
SWIFT_VERSION = "5.0"
MARKETING_VERSION = "0.1.0"

# Folders scanned for target sources, in project-navigator order.
APP_SOURCE_DIR = "ChazorAI"
TEST_SOURCE_DIR = "ChazorAITests"
# Files referenced only through build settings; shown in the navigator for convenience.
CONFIG_FILES = ["Config/Info.plist", "Config/ChazorAI.entitlements"]

FILE_TYPES = {
    ".swift": "sourcecode.swift",
    ".plist": "text.plist.xml",
    ".entitlements": "text.plist.entitlements",
    ".md": "net.daringfireball.markdown",
    ".json": "text.json",
    ".xcassets": "folder.assetcatalog",
}


def oid(key: str) -> str:
    """Stable 96-bit object identifier."""
    return hashlib.md5(key.encode("utf-8")).hexdigest()[:24].upper()


def file_type(path: str) -> str:
    _, ext = os.path.splitext(path)
    return FILE_TYPES.get(ext, "text")


class Tree:
    """Directory tree of the files that go into the project navigator."""

    def __init__(self, name: str, path: str):
        self.name = name
        self.path = path
        self.children: dict[str, "Tree"] = {}
        self.files: list[str] = []


def scan(directory: str) -> Tree:
    root = Tree(os.path.basename(directory), directory)
    for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, directory)):
        rel = os.path.relpath(dirpath, os.path.join(ROOT, directory))
        # An asset catalog is one reference, not a folder of JSON.
        if ".xcassets" in rel:
            continue
        dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
        node = root
        if rel != ".":
            for part in rel.split(os.sep):
                node = node.children.setdefault(part, Tree(part, os.path.join(node.path, part)))
        for name in sorted(filenames):
            if name.startswith("."):
                continue
            if name.endswith((".swift", ".plist", ".json", ".md")) and not name.endswith("Contents.json"):
                node.files.append(name)
        for name in sorted(dirnames):
            if name.endswith(".xcassets"):
                node.files.append(name)
                dirnames.remove(name)
    return root


def collect_sources(node: Tree, acc: list[str]) -> None:
    for name in node.files:
        acc.append(os.path.join(node.path, name))
    for child in sorted(node.children.values(), key=lambda c: c.name):
        collect_sources(child, acc)


def emit_group(node: Tree, lines: list[str], is_root: bool = False) -> str:
    """Writes a PBXGroup for `node` and returns its object id."""
    child_ids: list[tuple[str, str]] = []
    for child in sorted(node.children.values(), key=lambda c: c.name):
        child_ids.append((emit_group(child, lines), child.name))
    for name in node.files:
        child_ids.append((oid("file:" + os.path.join(node.path, name)), name))

    group_id = oid("group:" + node.path)
    lines.append(f"\t\t{group_id} /* {node.name} */ = {{")
    lines.append("\t\t\tisa = PBXGroup;")
    lines.append("\t\t\tchildren = (")
    for cid, name in child_ids:
        lines.append(f"\t\t\t\t{cid} /* {name} */,")
    lines.append("\t\t\t);")
    lines.append(f"\t\t\tpath = {node.name};")
    lines.append("\t\t\tsourceTree = \"<group>\";")
    lines.append("\t\t};")
    return group_id


def build_settings(pairs: dict[str, str], indent: str) -> list[str]:
    out = []
    for key in sorted(pairs):
        out.append(f"{indent}{key} = {pairs[key]};")
    return out


PROJECT_COMMON = {
    "ALWAYS_SEARCH_USER_PATHS": "NO",
    "CLANG_ANALYZER_NONNULL": "YES",
    "CLANG_ENABLE_MODULES": "YES",
    "CLANG_ENABLE_OBJC_ARC": "YES",
    "ENABLE_STRICT_OBJC_MSGSEND": "YES",
    "GCC_C_LANGUAGE_STANDARD": "gnu17",
    "IPHONEOS_DEPLOYMENT_TARGET": DEPLOYMENT_TARGET,
    "SDKROOT": "iphoneos",
    "SWIFT_EMIT_LOC_STRINGS": "YES",
    "SWIFT_VERSION": SWIFT_VERSION,
    "CLANG_WARN_DOCUMENTATION_COMMENTS": "YES",
    "CLANG_WARN_UNGUARDED_AVAILABILITY": "YES_AGGRESSIVE",
    "GCC_WARN_UNDECLARED_SELECTOR": "YES",
    "GCC_WARN_UNUSED_FUNCTION": "YES",
    "GCC_WARN_UNUSED_VARIABLE": "YES",
    "ENABLE_USER_SCRIPT_SANDBOXING": "YES",
}

PROJECT_DEBUG = dict(PROJECT_COMMON, **{
    "DEBUG_INFORMATION_FORMAT": "dwarf",
    "ENABLE_TESTABILITY": "YES",
    "GCC_OPTIMIZATION_LEVEL": "0",
    "GCC_PREPROCESSOR_DEFINITIONS": '(\n\t\t\t\t\t"DEBUG=1",\n\t\t\t\t\t"$(inherited)",\n\t\t\t\t)',
    "MTL_ENABLE_DEBUG_INFO": "INCLUDE_SOURCE",
    "ONLY_ACTIVE_ARCH": "YES",
    "SWIFT_ACTIVE_COMPILATION_CONDITIONS": '"DEBUG $(inherited)"',
    "SWIFT_OPTIMIZATION_LEVEL": '"-Onone"',
})

PROJECT_RELEASE = dict(PROJECT_COMMON, **{
    "DEBUG_INFORMATION_FORMAT": '"dwarf-with-dsym"',
    "ENABLE_NS_ASSERTIONS": "NO",
    "MTL_ENABLE_DEBUG_INFO": "NO",
    "SWIFT_COMPILATION_MODE": "wholemodule",
    "VALIDATE_PRODUCT": "YES",
})

APP_COMMON = {
    "ASSETCATALOG_COMPILER_APPICON_NAME": "AppIcon",
    "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME": "AccentColor",
    "CODE_SIGN_STYLE": "Automatic",
    "CURRENT_PROJECT_VERSION": "1",
    "ENABLE_PREVIEWS": "YES",
    "GENERATE_INFOPLIST_FILE": "NO",
    "INFOPLIST_FILE": "Config/Info.plist",
    "LD_RUNPATH_SEARCH_PATHS": '(\n\t\t\t\t\t"$(inherited)",\n\t\t\t\t\t"@executable_path/Frameworks",\n\t\t\t\t)',
    "MARKETING_VERSION": MARKETING_VERSION,
    "PRODUCT_BUNDLE_IDENTIFIER": BUNDLE_ID,
    "PRODUCT_NAME": '"$(TARGET_NAME)"',
    "SWIFT_EMIT_LOC_STRINGS": "YES",
    "TARGETED_DEVICE_FAMILY": '"1"',
    # CarPlay needs the driving-task entitlement, which Apple grants per App ID. The line
    # below stays commented out so the project builds without it; see Docs/CARPLAY.md.
    # "CODE_SIGN_ENTITLEMENTS": "Config/ChazorAI.entitlements",
}

TEST_COMMON = {
    "BUNDLE_LOADER": '"$(TEST_HOST)"',
    "CURRENT_PROJECT_VERSION": "1",
    "GENERATE_INFOPLIST_FILE": "YES",
    "MARKETING_VERSION": MARKETING_VERSION,
    "PRODUCT_BUNDLE_IDENTIFIER": f"{BUNDLE_ID}Tests",
    "PRODUCT_NAME": '"$(TARGET_NAME)"',
    "TARGETED_DEVICE_FAMILY": '"1"',
    "TEST_HOST": f'"$(BUILT_PRODUCTS_DIR)/{PROJECT_NAME}.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/{PROJECT_NAME}"',
}


def generate() -> str:
    app_tree = scan(APP_SOURCE_DIR)
    test_tree = scan(TEST_SOURCE_DIR)

    app_files: list[str] = []
    collect_sources(app_tree, app_files)
    test_files: list[str] = []
    collect_sources(test_tree, test_files)

    app_sources = [f for f in app_files if f.endswith(".swift")]
    app_resources = [f for f in app_files if f.endswith(".xcassets")]
    test_sources = [f for f in test_files if f.endswith(".swift")]

    ids = {
        "project": oid("project"),
        "main_group": oid("group:main"),
        "products_group": oid("group:products"),
        "config_group": oid("group:Config"),
        "app_target": oid("target:app"),
        "test_target": oid("target:tests"),
        "app_product": oid("product:app"),
        "test_product": oid("product:tests"),
        "app_sources": oid("phase:app:sources"),
        "app_frameworks": oid("phase:app:frameworks"),
        "app_resources": oid("phase:app:resources"),
        "test_sources": oid("phase:tests:sources"),
        "test_frameworks": oid("phase:tests:frameworks"),
        "test_resources": oid("phase:tests:resources"),
        "project_configs": oid("configlist:project"),
        "app_configs": oid("configlist:app"),
        "test_configs": oid("configlist:tests"),
        "project_debug": oid("config:project:debug"),
        "project_release": oid("config:project:release"),
        "app_debug": oid("config:app:debug"),
        "app_release": oid("config:app:release"),
        "test_debug": oid("config:tests:debug"),
        "test_release": oid("config:tests:release"),
        "dependency": oid("dependency:tests"),
        "container_proxy": oid("proxy:tests"),
    }

    lines: list[str] = []
    lines.append("// !$*UTF8*$!")
    lines.append("{")
    lines.append("\tarchiveVersion = 1;")
    lines.append("\tclasses = {")
    lines.append("\t};")
    lines.append("\tobjectVersion = 56;")
    lines.append("\tobjects = {")

    # PBXBuildFile
    lines.append("")
    lines.append("/* Begin PBXBuildFile section */")
    for path in app_sources + app_resources:
        name = os.path.basename(path)
        phase = "Resources" if path.endswith(".xcassets") else "Sources"
        lines.append(
            f"\t\t{oid('build:app:' + path)} /* {name} in {phase} */ = "
            f"{{isa = PBXBuildFile; fileRef = {oid('file:' + path)} /* {name} */; }};"
        )
    for path in test_sources:
        name = os.path.basename(path)
        lines.append(
            f"\t\t{oid('build:tests:' + path)} /* {name} in Sources */ = "
            f"{{isa = PBXBuildFile; fileRef = {oid('file:' + path)} /* {name} */; }};"
        )
    lines.append("/* End PBXBuildFile section */")

    # PBXContainerItemProxy
    lines.append("")
    lines.append("/* Begin PBXContainerItemProxy section */")
    lines.append(f"\t\t{ids['container_proxy']} /* PBXContainerItemProxy */ = {{")
    lines.append("\t\t\tisa = PBXContainerItemProxy;")
    lines.append(f"\t\t\tcontainerPortal = {ids['project']} /* Project object */;")
    lines.append("\t\t\tproxyType = 1;")
    lines.append(f"\t\t\tremoteGlobalIDString = {ids['app_target']};")
    lines.append(f"\t\t\tremoteInfo = {PROJECT_NAME};")
    lines.append("\t\t};")
    lines.append("/* End PBXContainerItemProxy section */")

    # PBXFileReference
    lines.append("")
    lines.append("/* Begin PBXFileReference section */")
    for path in sorted(set(app_files + test_files + CONFIG_FILES)):
        name = os.path.basename(path)
        lines.append(
            f"\t\t{oid('file:' + path)} /* {name} */ = {{isa = PBXFileReference; "
            f"lastKnownFileType = {file_type(path)}; path = {name}; sourceTree = \"<group>\"; }};"
        )
    lines.append(
        f"\t\t{ids['app_product']} /* {PROJECT_NAME}.app */ = {{isa = PBXFileReference; "
        f"explicitFileType = wrapper.application; includeInIndex = 0; "
        f"path = {PROJECT_NAME}.app; sourceTree = BUILT_PRODUCTS_DIR; }};"
    )
    lines.append(
        f"\t\t{ids['test_product']} /* {TEST_TARGET_NAME}.xctest */ = {{isa = PBXFileReference; "
        f"explicitFileType = wrapper.cfbundle; includeInIndex = 0; "
        f"path = {TEST_TARGET_NAME}.xctest; sourceTree = BUILT_PRODUCTS_DIR; }};"
    )
    lines.append("/* End PBXFileReference section */")

    # PBXFrameworksBuildPhase
    lines.append("")
    lines.append("/* Begin PBXFrameworksBuildPhase section */")
    for key, label in ((ids["app_frameworks"], PROJECT_NAME), (ids["test_frameworks"], TEST_TARGET_NAME)):
        lines.append(f"\t\t{key} /* Frameworks */ = {{")
        lines.append("\t\t\tisa = PBXFrameworksBuildPhase;")
        lines.append("\t\t\tbuildActionMask = 2147483647;")
        lines.append("\t\t\tfiles = (")
        lines.append("\t\t\t);")
        lines.append("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
        lines.append("\t\t};")
    lines.append("/* End PBXFrameworksBuildPhase section */")

    # PBXGroup
    lines.append("")
    lines.append("/* Begin PBXGroup section */")
    app_group = emit_group(app_tree, lines)
    test_group = emit_group(test_tree, lines)

    lines.append(f"\t\t{ids['config_group']} /* Config */ = {{")
    lines.append("\t\t\tisa = PBXGroup;")
    lines.append("\t\t\tchildren = (")
    for path in CONFIG_FILES:
        lines.append(f"\t\t\t\t{oid('file:' + path)} /* {os.path.basename(path)} */,")
    lines.append("\t\t\t);")
    lines.append("\t\t\tpath = Config;")
    lines.append("\t\t\tsourceTree = \"<group>\";")
    lines.append("\t\t};")

    lines.append(f"\t\t{ids['products_group']} /* Products */ = {{")
    lines.append("\t\t\tisa = PBXGroup;")
    lines.append("\t\t\tchildren = (")
    lines.append(f"\t\t\t\t{ids['app_product']} /* {PROJECT_NAME}.app */,")
    lines.append(f"\t\t\t\t{ids['test_product']} /* {TEST_TARGET_NAME}.xctest */,")
    lines.append("\t\t\t);")
    lines.append("\t\t\tname = Products;")
    lines.append("\t\t\tsourceTree = \"<group>\";")
    lines.append("\t\t};")

    lines.append(f"\t\t{ids['main_group']} = {{")
    lines.append("\t\t\tisa = PBXGroup;")
    lines.append("\t\t\tchildren = (")
    lines.append(f"\t\t\t\t{app_group} /* {APP_SOURCE_DIR} */,")
    lines.append(f"\t\t\t\t{test_group} /* {TEST_SOURCE_DIR} */,")
    lines.append(f"\t\t\t\t{ids['config_group']} /* Config */,")
    lines.append(f"\t\t\t\t{ids['products_group']} /* Products */,")
    lines.append("\t\t\t);")
    lines.append("\t\t\tsourceTree = \"<group>\";")
    lines.append("\t\t};")
    lines.append("/* End PBXGroup section */")

    # PBXNativeTarget
    lines.append("")
    lines.append("/* Begin PBXNativeTarget section */")
    lines.append(f"\t\t{ids['app_target']} /* {PROJECT_NAME} */ = {{")
    lines.append("\t\t\tisa = PBXNativeTarget;")
    lines.append(f"\t\t\tbuildConfigurationList = {ids['app_configs']};")
    lines.append("\t\t\tbuildPhases = (")
    lines.append(f"\t\t\t\t{ids['app_sources']} /* Sources */,")
    lines.append(f"\t\t\t\t{ids['app_frameworks']} /* Frameworks */,")
    lines.append(f"\t\t\t\t{ids['app_resources']} /* Resources */,")
    lines.append("\t\t\t);")
    lines.append("\t\t\tbuildRules = (")
    lines.append("\t\t\t);")
    lines.append("\t\t\tdependencies = (")
    lines.append("\t\t\t);")
    lines.append(f"\t\t\tname = {PROJECT_NAME};")
    lines.append(f"\t\t\tproductName = {PROJECT_NAME};")
    lines.append(f"\t\t\tproductReference = {ids['app_product']} /* {PROJECT_NAME}.app */;")
    lines.append("\t\t\tproductType = \"com.apple.product-type.application\";")
    lines.append("\t\t};")

    lines.append(f"\t\t{ids['test_target']} /* {TEST_TARGET_NAME} */ = {{")
    lines.append("\t\t\tisa = PBXNativeTarget;")
    lines.append(f"\t\t\tbuildConfigurationList = {ids['test_configs']};")
    lines.append("\t\t\tbuildPhases = (")
    lines.append(f"\t\t\t\t{ids['test_sources']} /* Sources */,")
    lines.append(f"\t\t\t\t{ids['test_frameworks']} /* Frameworks */,")
    lines.append(f"\t\t\t\t{ids['test_resources']} /* Resources */,")
    lines.append("\t\t\t);")
    lines.append("\t\t\tbuildRules = (")
    lines.append("\t\t\t);")
    lines.append("\t\t\tdependencies = (")
    lines.append(f"\t\t\t\t{ids['dependency']} /* PBXTargetDependency */,")
    lines.append("\t\t\t);")
    lines.append(f"\t\t\tname = {TEST_TARGET_NAME};")
    lines.append(f"\t\t\tproductName = {TEST_TARGET_NAME};")
    lines.append(f"\t\t\tproductReference = {ids['test_product']} /* {TEST_TARGET_NAME}.xctest */;")
    lines.append("\t\t\tproductType = \"com.apple.product-type.bundle.unit-test\";")
    lines.append("\t\t};")
    lines.append("/* End PBXNativeTarget section */")

    # PBXProject
    lines.append("")
    lines.append("/* Begin PBXProject section */")
    lines.append(f"\t\t{ids['project']} /* Project object */ = {{")
    lines.append("\t\t\tisa = PBXProject;")
    lines.append("\t\t\tattributes = {")
    lines.append("\t\t\t\tBuildIndependentTargetsInParallel = 1;")
    lines.append("\t\t\t\tLastSwiftUpdateCheck = 1600;")
    lines.append("\t\t\t\tLastUpgradeCheck = 1600;")
    lines.append("\t\t\t\tTargetAttributes = {")
    lines.append(f"\t\t\t\t\t{ids['app_target']} = {{")
    lines.append("\t\t\t\t\t\tCreatedOnToolsVersion = 16.0;")
    lines.append("\t\t\t\t\t};")
    lines.append(f"\t\t\t\t\t{ids['test_target']} = {{")
    lines.append("\t\t\t\t\t\tCreatedOnToolsVersion = 16.0;")
    lines.append(f"\t\t\t\t\t\tTestTargetID = {ids['app_target']};")
    lines.append("\t\t\t\t\t};")
    lines.append("\t\t\t\t};")
    lines.append("\t\t\t};")
    lines.append(f"\t\t\tbuildConfigurationList = {ids['project_configs']};")
    lines.append("\t\t\tcompatibilityVersion = \"Xcode 14.0\";")
    lines.append("\t\t\tdevelopmentRegion = en;")
    lines.append("\t\t\thasScannedForEncodings = 0;")
    lines.append("\t\t\tknownRegions = (")
    lines.append("\t\t\t\ten,")
    lines.append("\t\t\t\tBase,")
    lines.append("\t\t\t\tru,")
    lines.append("\t\t\t);")
    lines.append(f"\t\t\tmainGroup = {ids['main_group']};")
    lines.append(f"\t\t\tproductRefGroup = {ids['products_group']} /* Products */;")
    lines.append("\t\t\tprojectDirPath = \"\";")
    lines.append("\t\t\tprojectRoot = \"\";")
    lines.append("\t\t\ttargets = (")
    lines.append(f"\t\t\t\t{ids['app_target']} /* {PROJECT_NAME} */,")
    lines.append(f"\t\t\t\t{ids['test_target']} /* {TEST_TARGET_NAME} */,")
    lines.append("\t\t\t);")
    lines.append("\t\t};")
    lines.append("/* End PBXProject section */")

    # PBXResourcesBuildPhase
    lines.append("")
    lines.append("/* Begin PBXResourcesBuildPhase section */")
    lines.append(f"\t\t{ids['app_resources']} /* Resources */ = {{")
    lines.append("\t\t\tisa = PBXResourcesBuildPhase;")
    lines.append("\t\t\tbuildActionMask = 2147483647;")
    lines.append("\t\t\tfiles = (")
    for path in app_resources:
        lines.append(
            f"\t\t\t\t{oid('build:app:' + path)} /* {os.path.basename(path)} in Resources */,"
        )
    lines.append("\t\t\t);")
    lines.append("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    lines.append("\t\t};")
    lines.append(f"\t\t{ids['test_resources']} /* Resources */ = {{")
    lines.append("\t\t\tisa = PBXResourcesBuildPhase;")
    lines.append("\t\t\tbuildActionMask = 2147483647;")
    lines.append("\t\t\tfiles = (")
    lines.append("\t\t\t);")
    lines.append("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    lines.append("\t\t};")
    lines.append("/* End PBXResourcesBuildPhase section */")

    # PBXSourcesBuildPhase
    lines.append("")
    lines.append("/* Begin PBXSourcesBuildPhase section */")
    lines.append(f"\t\t{ids['app_sources']} /* Sources */ = {{")
    lines.append("\t\t\tisa = PBXSourcesBuildPhase;")
    lines.append("\t\t\tbuildActionMask = 2147483647;")
    lines.append("\t\t\tfiles = (")
    for path in app_sources:
        lines.append(f"\t\t\t\t{oid('build:app:' + path)} /* {os.path.basename(path)} in Sources */,")
    lines.append("\t\t\t);")
    lines.append("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    lines.append("\t\t};")
    lines.append(f"\t\t{ids['test_sources']} /* Sources */ = {{")
    lines.append("\t\t\tisa = PBXSourcesBuildPhase;")
    lines.append("\t\t\tbuildActionMask = 2147483647;")
    lines.append("\t\t\tfiles = (")
    for path in test_sources:
        lines.append(f"\t\t\t\t{oid('build:tests:' + path)} /* {os.path.basename(path)} in Sources */,")
    lines.append("\t\t\t);")
    lines.append("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    lines.append("\t\t};")
    lines.append("/* End PBXSourcesBuildPhase section */")

    # PBXTargetDependency
    lines.append("")
    lines.append("/* Begin PBXTargetDependency section */")
    lines.append(f"\t\t{ids['dependency']} /* PBXTargetDependency */ = {{")
    lines.append("\t\t\tisa = PBXTargetDependency;")
    lines.append(f"\t\t\ttarget = {ids['app_target']} /* {PROJECT_NAME} */;")
    lines.append(f"\t\t\ttargetProxy = {ids['container_proxy']} /* PBXContainerItemProxy */;")
    lines.append("\t\t};")
    lines.append("/* End PBXTargetDependency section */")

    # XCBuildConfiguration
    lines.append("")
    lines.append("/* Begin XCBuildConfiguration section */")
    configs = [
        (ids["project_debug"], "Debug", PROJECT_DEBUG),
        (ids["project_release"], "Release", PROJECT_RELEASE),
        (ids["app_debug"], "Debug", APP_COMMON),
        (ids["app_release"], "Release", APP_COMMON),
        (ids["test_debug"], "Debug", TEST_COMMON),
        (ids["test_release"], "Release", TEST_COMMON),
    ]
    for key, name, settings in configs:
        lines.append(f"\t\t{key} /* {name} */ = {{")
        lines.append("\t\t\tisa = XCBuildConfiguration;")
        lines.append("\t\t\tbuildSettings = {")
        lines.extend(build_settings(settings, "\t\t\t\t"))
        lines.append("\t\t\t};")
        lines.append(f"\t\t\tname = {name};")
        lines.append("\t\t};")
    lines.append("/* End XCBuildConfiguration section */")

    # XCConfigurationList
    lines.append("")
    lines.append("/* Begin XCConfigurationList section */")
    lists = [
        (ids["project_configs"], f"PBXProject \"{PROJECT_NAME}\"", ids["project_debug"], ids["project_release"]),
        (ids["app_configs"], f"PBXNativeTarget \"{PROJECT_NAME}\"", ids["app_debug"], ids["app_release"]),
        (ids["test_configs"], f"PBXNativeTarget \"{TEST_TARGET_NAME}\"", ids["test_debug"], ids["test_release"]),
    ]
    for key, label, debug, release in lists:
        lines.append(f"\t\t{key} /* Build configuration list for {label} */ = {{")
        lines.append("\t\t\tisa = XCConfigurationList;")
        lines.append("\t\t\tbuildConfigurations = (")
        lines.append(f"\t\t\t\t{debug} /* Debug */,")
        lines.append(f"\t\t\t\t{release} /* Release */,")
        lines.append("\t\t\t);")
        lines.append("\t\t\tdefaultConfigurationIsVisible = 0;")
        lines.append("\t\t\tdefaultConfigurationName = Release;")
        lines.append("\t\t};")
    lines.append("/* End XCConfigurationList section */")

    lines.append("\t};")
    lines.append(f"\trootObject = {ids['project']} /* Project object */;")
    lines.append("}")
    return "\n".join(lines) + "\n"


SCHEME = """<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion = "1600" version = "1.7">
   <BuildAction parallelizeBuildables = "YES" buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry buildForTesting = "YES" buildForRunning = "YES" buildForProfiling = "YES" buildForArchiving = "YES" buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "{app_target}"
               BuildableName = "{project}.app"
               BlueprintName = "{project}"
               ReferencedContainer = "container:{project}.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv = "YES">
      <Testables>
         <TestableReference skipped = "NO">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "{test_target}"
               BuildableName = "{tests}.xctest"
               BlueprintName = "{tests}"
               ReferencedContainer = "container:{project}.xcodeproj">
            </BuildableReference>
         </TestableReference>
      </Testables>
   </TestAction>
   <LaunchAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle = "0" useCustomWorkingDirectory = "NO" ignoresPersistentStateOnLaunch = "NO" debugDocumentVersioning = "YES" debugServiceExtension = "internal" allowLocationSimulation = "YES">
      <BuildableProductRunnable runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "{app_target}"
            BuildableName = "{project}.app"
            BlueprintName = "{project}"
            ReferencedContainer = "container:{project}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
      <EnvironmentVariables>
         <EnvironmentVariable key = "ANTHROPIC_API_KEY" value = "" isEnabled = "NO">
         </EnvironmentVariable>
      </EnvironmentVariables>
   </LaunchAction>
   <ProfileAction buildConfiguration = "Release" shouldUseLaunchSchemeArgsEnv = "YES" savedToolIdentifier = "" useCustomWorkingDirectory = "NO" debugDocumentVersioning = "YES">
      <BuildableProductRunnable runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "{app_target}"
            BuildableName = "{project}.app"
            BlueprintName = "{project}"
            ReferencedContainer = "container:{project}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction buildConfiguration = "Release" revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
"""


def main() -> int:
    project_dir = os.path.join(ROOT, f"{PROJECT_NAME}.xcodeproj")
    scheme_dir = os.path.join(project_dir, "xcshareddata", "xcschemes")
    os.makedirs(scheme_dir, exist_ok=True)

    with open(os.path.join(project_dir, "project.pbxproj"), "w", encoding="utf-8") as handle:
        handle.write(generate())

    scheme = SCHEME.format(
        project=PROJECT_NAME,
        tests=TEST_TARGET_NAME,
        app_target=oid("target:app"),
        test_target=oid("target:tests"),
    )
    with open(os.path.join(scheme_dir, f"{PROJECT_NAME}.xcscheme"), "w", encoding="utf-8") as handle:
        handle.write(scheme)

    print(f"Wrote {PROJECT_NAME}.xcodeproj")
    return 0


if __name__ == "__main__":
    sys.exit(main())
