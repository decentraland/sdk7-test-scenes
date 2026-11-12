#!/usr/bin/env bash
# Builds upstream urosidoki/htn_planner (aec08fa) and the golden-plan driver (driver.cpp) with plain g++/gcc: no CMake,
# premake, SDL or GoogleTest. Needs Linux with g++ (13 is enough), gcc, git, awk; WSL Ubuntu 24.04 works.
# Mirrors cmake/LinuxSmoke/CMakeLists.txt and premake5.lua: HTNFramework/src/**.cpp minus pch.cpp and
# HTNIntegration/src/**.cpp as C++20 with the Debug defines and USE_OPTICK=0; HTNTranslator from
# HTNTranslator/src/main.cpp; every domain the manifest names translated with --runtime-backtracking-support=enabled
# (the RuntimeBacktracking variant, so the driver can switch backtracking modes) and compiled as C11 with gcc; the
# HTNDemo Wanderer pathfinder (AI/AIHTNDemoPathfinder.cpp, World/DemoGridTerrain.cpp); all linked into one driver.
#
# Usage: build.sh <manifest.tsv> [--run]
#   --run            then run every manifest case and print the driver's output (build messages go to stderr)
#   HTN_GOLDEN_BUILD build directory (default ~/htn-golden-build)
#   HTN_UPSTREAM     upstream checkout (default ~/src/htn-upstream; cloned from GitHub when missing, pinned to aec08fa)
#   HTN_BUILD_JOBS   parallel compiles (default: nproc)
# Library objects are reused between runs; domains and the driver are rebuilt every time.
set -euo pipefail

here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
scene=$(cd -- "$here/../.." && pwd)
manifest=${1:?usage: build.sh <manifest.tsv> [--run]}
run=${2:-}
build=${HTN_GOLDEN_BUILD:-$HOME/htn-golden-build}
[[ -z $run ]] || exec 3>&1 1>&2
upstream=${HTN_UPSTREAM:-$HOME/src/htn-upstream}
commit=aec08fa36f2c521c4da00c045bf23b8aed7bfa92
jobs=${HTN_BUILD_JOBS:-$(nproc)}

if [[ ! -d $upstream/.git ]]; then
    git clone -q https://github.com/urosidoki/htn_planner.git "$upstream"
fi
if [[ $(git -C "$upstream" rev-parse HEAD) != "$commit" ]]; then
    git -C "$upstream" checkout -q "$commit"
fi

resolve() {
    case $1 in
        upstream:*) echo "$upstream/${1#upstream:}" ;;
        scene:*) echo "$scene/${1#scene:}" ;;
        *) echo "$1" ;;
    esac
}

mkdir -p "$build/obj"
rm -rf "$build/generated"
mkdir -p "$build/generated"
defines="-DHTN_DEBUG -DHTN_ENABLE_LOGGING -DHTN_VALIDATE_DOMAIN -DHTN_DEBUG_DECOMPOSITION -DUSE_OPTICK=0"
includes="-I$upstream/HTNFramework/src -I$upstream/HTNIntegration/src -I$upstream/HTNDemo/src -I$upstream/ThirdParty/optick/src"
cxx="g++ -std=c++20 -O1 -g0 -fPIC -pthread $defines $includes -include $upstream/HTNFramework/src/pch.h"
cc="gcc -std=c11 -O1 -g0 -fPIC $defines $includes"

sources=$(cd "$upstream" && { find HTNFramework/src HTNIntegration/src -name '*.cpp' ! -name pch.cpp; \
    echo HTNDemo/src/AI/AIHTNDemoPathfinder.cpp; echo HTNDemo/src/World/DemoGridTerrain.cpp; } | sort)
export upstream build cxx
echo "$sources" | xargs -P "$jobs" -I{} bash -c '
    obj=$build/obj/$(echo {} | tr / _).o
    [[ -f $obj ]] || $cxx -c "$upstream/{}" -o "$obj" || { echo "FAILED: {}" >&2; exit 255; }
' || { echo "upstream library build failed" >&2; exit 1; }
libobjs=$(for src in $sources; do echo "$build/obj/$(echo "$src" | tr / _).o"; done)
translator_objs=$(echo "$libobjs" | grep -v HTNDemo)

if [[ ! -x $build/HTNTranslator ]]; then
    $cxx "$upstream/HTNTranslator/src/main.cpp" $translator_objs -o "$build/HTNTranslator" -ldl
fi

# Translate every domain the manifest names (column 2). Entry point: Create<Name>HTN, the file name with the first
# letter of every _/- separated word upper-cased (premake5.lua MakeHTNEntryPoint).
registry=$build/generated/registry.inc
: > "$registry"
genobjs=()
for domain in $(awk -F'\t' '!/^#/ && NF >= 2 { print $2 }' "$manifest" | sort -u); do
    path=$(resolve "$domain")
    base=$(basename "$path" .domain)
    entry=Create$(echo "$base" | awk -F'[_ -]' '{ for (i = 1; i <= NF; i++) printf "%s%s", toupper(substr($i, 1, 1)), substr($i, 2) }')HTN
    out=$build/generated/$entry
    [[ ! -d $out ]] || { echo "two manifest domains share the entry point $entry" >&2; exit 1; }
    mkdir -p "$out"
    "$build/HTNTranslator" "$path" "$entry" "$out" --runtime-backtracking-support=enabled > "$out/translator.log" 2>&1 \
        || { cat "$out/translator.log" >&2; echo "translation failed: $domain" >&2; exit 1; }
    $cc -c "$out/$base.generated.c" -o "$out/$base.o"
    genobjs+=("$out/$base.o")
    printf 'HTN_GOLDEN_DOMAIN("%s", %s)\n' "$domain" "$entry" >> "$registry"
done

$cxx -I"$build/generated" "$here/driver.cpp" "${genobjs[@]}" $libobjs -o "$build/htn-golden" -ldl
echo "built $build/htn-golden ($(wc -l < "$registry") domains)"
[[ -z $run ]] || exec "$build/htn-golden" "$manifest" "$upstream" "$scene" >&3
