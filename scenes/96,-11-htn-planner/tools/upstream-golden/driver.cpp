// Golden-plan driver: plans one manifest case with upstream urosidoki/htn_planner (aec08fa), through the generated
// (translator) planner and HTNPlanningUnit, the way the upstream host code does, and prints the plan in the format of
// HTNTest's FormatPlan (HTNGeneratedEquivalenceTest.cpp:390-411).
//
// Usage: htn-golden <manifest.tsv> <upstream-root> <scene-root> [case-id...]
// Manifest columns (tab separated, '#' lines ignored):
//   id, domain, worldstate, method, args, mode, callterms
//   domain / worldstate: "upstream:<path>" (in the upstream checkout) or "scene:<path>" (in our scene); worldstate "-":
//   an empty world. args: atoms in .worldstate syntax, or "-". mode: ALL | FACTS_AND_AXIOMS | BRANCHES | NONE.
//   callterms: test (HTNTest BindTestCallTerms + its world-state daemon), wanderer (HTNDemo Wanderer agent + its
//   Pathfinder daemon), empty (an empty registry).
// Output, per case:
//   === <id>
//   status: <succeeded | no_plan | ...>
//   <one plan step per line>
//   # callterm error: ...      (upstream's Report policy, one line per failed invocation)
//
// The callterms are copies of the upstream bindings (sources below); the Wanderer's pathfinder is upstream's own class
// (HTNDemo/src/AI/AIHTNDemoPathfinder.cpp), on a 16 x 13 terrain like the scene's gallery station.
#include <cstdio>
#include <cstring>
#include <unistd.h>
#include <fstream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "HTNCoreMinimal.h"
#include "HTNIntegration.h"
#include "AI/AIHtnListDaemon.h"
#include "AI/AIHTNDemoPathfinder.h"
#include "Core/HTNCallTermBinding.h"
#include "Core/HTNCallTermError.h"
#include "Core/HTNCallTermRegistry.h"
#include "Core/HtnSymbol.h"
#include "Core/HTNTask.h"
#include "Hook/HTNDatabaseHook.h"
#include "Hook/HTNPlannerHook.h"
#include "Hook/HTNPlanningUnit.h"
#include "Translator/HTNGeneratedPlanner.h"
#include "World/DemoGridTerrain.h"

#define HTN_GOLDEN_DOMAIN(Key, Entry) extern "C" const HTNGeneratedPlannerDefinition* Entry##_GetDefinition(void);
#include "registry.inc"
#undef HTN_GOLDEN_DOMAIN

namespace
{
struct DomainEntry
{
    const char* Key;
    const HTNGeneratedPlannerDefinition* (*GetDefinition)(void);
};

#define HTN_GOLDEN_DOMAIN(Key, Entry) {Key, &Entry##_GetDefinition},
const DomainEntry kDomains[] = {
#include "registry.inc"
};
#undef HTN_GOLDEN_DOMAIN

// ---- HTNTest: HTNGeneratedEquivalenceTest.cpp:204-363 (BindTestCallTerms, TestWorldStateCallTermDaemon) ----------

class TestWorldStateCallTermDaemon
{
public:
    explicit TestWorldStateCallTermDaemon(HTNWorldState& ioWorldState, std::string inTarget = "enemy0")
        : mWorldState(ioWorldState), mTarget(std::move(inTarget))
    {
    }

    static void BindCallTerms(HTNCallTermRegistry& ioRegistry)
    {
        HTN_CALLTERM_BIND_MEMBER(ioRegistry, "add_target_available", TestWorldStateCallTermDaemon, AddTargetAvailable);
    }

private:
    bool AddTargetAvailable()
    {
        const std::vector<HTNAtomOwner> Arguments{HTNAtomOwner(mTarget)};
        mWorldState.AddFact("target_available", Arguments);
        return true;
    }

    HTNWorldState& mWorldState;
    std::string mTarget;
};

bool IsInt(const HTNAtom& inAtom) { return HTNAtomIsBound(inAtom) && HTNAtomIsType<int32>(inAtom); }

void BindTestCallTerms(HTNCallTermRegistry& ioRegistry)
{
    AIHtnListDaemon::BindCallTerms(ioRegistry);
    TestWorldStateCallTermDaemon::BindCallTerms(ioRegistry);

    ioRegistry.Bind("binded_function_with_args", [](const HTNCallTermArguments& inArguments) -> bool {
        return inArguments.size() == 1 && HTNAtomIsBound(inArguments[0]) && HTNAtomIsType<std::string>(inArguments[0]);
    });
    ioRegistry.Bind("get_health", [](const HTNCallTermArguments& inArguments) -> int {
        return inArguments.size() == 1 && IsInt(inArguments[0]) ? 50 : 0;
    });
    ioRegistry.Bind("get_max_speed", [](const HTNCallTermArguments& inArguments) -> float {
        return inArguments.size() == 1 && IsInt(inArguments[0]) ? 1.0f : 0.0f;
    });
    ioRegistry.Bind("lt", [](const HTNCallTermArguments& inArguments) -> bool {
        return inArguments.size() == 2 && IsInt(inArguments[0]) && IsInt(inArguments[1]) &&
               HTNAtomGetValue<int32>(inArguments[0]) < HTNAtomGetValue<int32>(inArguments[1]);
    });
    ioRegistry.Bind("inc", [](const HTNCallTermArguments& inArguments) -> int {
        return inArguments.size() == 1 && IsInt(inArguments[0]) ? HTNAtomGetValue<int32>(inArguments[0]) + 1 : 0;
    });
    ioRegistry.Bind("add", [](const HTNCallTermArguments& inArguments) -> int {
        if (inArguments.size() != 2 || !IsInt(inArguments[0]) || !IsInt(inArguments[1]))
            return 0;
        return HTNAtomGetValue<int32>(inArguments[0]) + HTNAtomGetValue<int32>(inArguments[1]);
    });
    ioRegistry.Bind("mul", [](const HTNCallTermArguments& inArguments) -> int {
        if (inArguments.size() != 2 || !IsInt(inArguments[0]) || !IsInt(inArguments[1]))
            return 0;
        return HTNAtomGetValue<int32>(inArguments[0]) * HTNAtomGetValue<int32>(inArguments[1]);
    });
}

// ---- HTNDemo: AIHTNDemoWandererAgent.cpp:23-39, :92-98 ------------------------------------------------------------

struct WandererCallTerms
{
    static int32 Increment(const int32 inValue) { return inValue + 1; }
    static bool BothCoordinatesEven(const Cell& inLocation) { return (inLocation.X % 2) == 0 && (inLocation.Y % 2) == 0; }
    static bool BothCoordinatesOdd(const Cell& inLocation) { return (inLocation.X % 2) != 0 && (inLocation.Y % 2) != 0; }
};

void BindWandererCallTerms(HTNCallTermRegistry& ioRegistry)
{
    HTN_CALLTERM_BIND(ioRegistry, "inc", WandererCallTerms, Increment);
    HTN_CALLTERM_BIND(ioRegistry, "both_coordinates_even", WandererCallTerms, BothCoordinatesEven);
    HTN_CALLTERM_BIND(ioRegistry, "both_coordinates_odd", WandererCallTerms, BothCoordinatesOdd);
    AIHTNDemoPathfinder::BindCallTerms(ioRegistry);
}

// ---- formatting: HTNGeneratedEquivalenceTest.cpp:390-411 ----------------------------------------------------------

std::string FormatPlanStep(const HTNAtomOwner& inTask)
{
    std::ostringstream Stream;
    const HtnSymbol* TaskHead = HTNGetTaskHead(inTask);
    Stream << (TaskHead ? TaskHead->GetString() : "<invalid task>");
    const uint32 ArgumentCount = HTNGetTaskArgumentCount(inTask);
    for (uint32 ArgumentIndex = 0u; ArgumentIndex < ArgumentCount; ++ArgumentIndex)
        Stream << " " << HTNAtomToString(HTNGetTaskArgument(inTask, ArgumentIndex), true);
    return Stream.str();
}

const char* StatusName(const HTNDecompositionStatus inStatus)
{
    switch (inStatus)
    {
    case HTN_DECOMPOSITION_SUCCEEDED: return "succeeded";
    case HTN_DECOMPOSITION_NO_PLAN: return "no_plan";
    case HTN_DECOMPOSITION_BACKTRACKING_CAPACITY_EXCEEDED: return "backtracking_capacity_exceeded";
    case HTN_DECOMPOSITION_OUT_OF_MEMORY: return "out_of_memory";
    case HTN_DECOMPOSITION_INVALID_CONTEXT: return "invalid_context";
    case HTN_DECOMPOSITION_INVALID_CALL: return "invalid_call";
    case HTN_DECOMPOSITION_PREPARATION_FAILED: return "preparation_failed";
    case HTN_DECOMPOSITION_CALL_FRAME_CAPACITY_EXCEEDED: return "depth_exceeded";
    default: return "unknown";
    }
}

const char* ReasonName(const HTNCallTermErrorReason inReason)
{
    switch (inReason)
    {
    case HTNCallTermErrorReason::NotRegistered: return "not_registered";
    case HTNCallTermErrorReason::MissingBinding: return "missing_binding";
    case HTNCallTermErrorReason::MissingInstance: return "missing_instance";
    case HTNCallTermErrorReason::ArgumentCountMismatch: return "argument_count_mismatch";
    case HTNCallTermErrorReason::ArgumentTypeMismatch: return "argument_type_mismatch";
    case HTNCallTermErrorReason::ArgumentConversionFailed: return "argument_conversion_failed";
    case HTNCallTermErrorReason::ReturnConversionFailed: return "return_conversion_failed";
    case HTNCallTermErrorReason::NonBooleanConditionResult: return "non_boolean_condition_result";
    default: return "none";
    }
}

// The demo host leaves ClientContext null (it reaches the callterm converters), so errors go to a global.
std::vector<std::string> GErrors;

void ReportCallTermError(void*, const HTNCallTermErrorInfo* inInfo)
{
    GErrors.push_back(std::string("# callterm error: ") + (inInfo->Name ? inInfo->Name : "<unknown>") + " " +
                    ReasonName(inInfo->Reason));
}

// ---- manifest -----------------------------------------------------------------------------------------------------

struct Case
{
    std::string Id, Domain, WorldState, Method, Args, Mode, CallTerms;
};

std::vector<std::string> Split(const std::string& inLine, const char inSeparator)
{
    std::vector<std::string> Parts;
    std::string Part;
    std::istringstream Stream(inLine);
    while (std::getline(Stream, Part, inSeparator))
        Parts.push_back(Part);
    return Parts;
}

std::string Resolve(const std::string& inPath, const std::string& inUpstream, const std::string& inScene)
{
    if (inPath.rfind("upstream:", 0) == 0)
        return inUpstream + "/" + inPath.substr(9);
    if (inPath.rfind("scene:", 0) == 0)
        return inScene + "/" + inPath.substr(6);
    return inPath;
}

// Top-level arguments: parsed by upstream's world-state parser as the row of one fact.
bool ParseArguments(const std::string& inArgs, std::vector<HTNAtomOwner>& outArguments)
{
    if (inArgs == "-")
        return true;
    char Path[] = "/tmp/htn-golden-args-XXXXXX";
    const int Descriptor = mkstemp(Path);
    if (Descriptor < 0)
        return false;
    close(Descriptor);
    {
        std::ofstream File(Path);
        File << "golden_args " << inArgs << "\n";
    }
    HTNDatabaseHook Database;
    const bool Parsed = Database.ParseWorldStateFile(Path);
    std::remove(Path);
    if (!Parsed)
        return false;
    for (size Arity = 1; Arity <= HTNWorldStateHelpers::kFactArgumentsSize; ++Arity)
    {
        const HTNFactArgumentsTable* Table = Database.GetWorldState().FindFactArgumentsTable("golden_args", Arity);
        if (!Table || Table->GetFactArgumentsCollectionSize() != 1)
            continue;
        const HTNFactArguments& Row = Table->GetFactArgumentsCollection()[0];
        for (size Index = 0; Index < Arity; ++Index)
            outArguments.push_back(Row[Index]);
        return true;
    }
    return false;
}

void Run(const Case& inCase, const std::string& inUpstream, const std::string& inScene)
{
    std::printf("=== %s\n", inCase.Id.c_str());
    const HTNGeneratedPlannerDefinition* Definition = nullptr;
    for (const DomainEntry& Entry : kDomains)
        if (inCase.Domain == Entry.Key)
            Definition = Entry.GetDefinition();
    if (!Definition)
    {
        std::printf("status: driver_error (domain not built: %s)\n", inCase.Domain.c_str());
        return;
    }

    HTNDatabaseHook Database;
    if (inCase.WorldState != "-" && !Database.ParseWorldStateFile(Resolve(inCase.WorldState, inUpstream, inScene)))
    {
        std::printf("status: driver_error (world state did not parse: %s)\n", inCase.WorldState.c_str());
        return;
    }

    HTNCallTermRegistry Registry;
    if (inCase.CallTerms == "test")
        BindTestCallTerms(Registry);
    else if (inCase.CallTerms == "wanderer")
        BindWandererCallTerms(Registry);
    else if (inCase.CallTerms != "empty")
    {
        std::printf("status: driver_error (unknown callterm set: %s)\n", inCase.CallTerms.c_str());
        return;
    }

    HTNPlannerHook Planner(Database.GetWorldState(), Registry);
    if (!Planner.SetGeneratedPlannerDefinition(Definition))
    {
        std::printf("status: driver_error (incompatible generated definition)\n");
        return;
    }
    TestWorldStateCallTermDaemon TestDaemon(Database.GetWorldState());
    const DemoGridTerrain Terrain(16, 13);
    AIHTNDemoPathfinder Pathfinder(Terrain);
    if (inCase.CallTerms == "test")
        (void)HTN_CALLTERM_SET_DAEMON(Planner.GetCallTermBindingContext(), TestWorldStateCallTermDaemon, &TestDaemon);
    if (inCase.CallTerms == "wanderer")
    {
        Pathfinder.Initialize(&Planner);
        (void)HTN_CALLTERM_SET_DAEMON(Planner.GetCallTermBindingContext(), AIHTNDemoPathfinder, &Pathfinder);
    }

    const HtnSymbol* Method = HtnSymbol::sGetSymbol(inCase.Method);
    HTNPlanningUnit Unit(Database, Planner, Method);
    const std::string& Mode = inCase.Mode;
    Unit.SetBacktrackingMode(Mode == "NONE" ? HTN_BACKTRACKING_NONE
                             : Mode == "FACTS_AND_AXIOMS" ? HTN_BACKTRACKING_FACTS_AND_AXIOMS
                             : Mode == "BRANCHES" ? HTN_BACKTRACKING_BRANCHES
                                                  : HTN_BACKTRACKING_ALL);
    GErrors.clear();
    Unit.GetExecutionContext().CallTermErrorPolicy = HTNCallTermErrorPolicy::Report;
    Unit.GetExecutionContext().CallTermErrorCallback = &ReportCallTermError;

    std::vector<HTNAtomOwner> Arguments;
    if (!ParseArguments(inCase.Args, Arguments))
    {
        std::printf("status: driver_error (arguments did not parse: %s)\n", inCase.Args.c_str());
        return;
    }
    std::vector<HTNAtom> Raw;
    for (const HTNAtomOwner& Argument : Arguments)
        Raw.push_back(*Argument.Get());
    HTNAtom Call;
    HTNAtom_CreateCall(&Call, Method, Raw.data(), static_cast<uint32_t>(Raw.size()));
    const HTNDecompositionStatus Status = Unit.DecomposeTopLevelMethod(Call);
    HTNAtom::sDestroy(Call);

    std::printf("status: %s\n", StatusName(Status));
    const HTNAtomOwner& Plan = Unit.GetLastDecomposition().GetResult();
    const int32_t Count = Plan.GetListSize();
    for (int32_t Index = 0; Index < Count; ++Index)
        std::printf("%s\n", FormatPlanStep(HTNAtomOwner(Plan.GetListElement(static_cast<uint32>(Index)))).c_str());
    for (const std::string& Line : GErrors)
        std::printf("%s\n", Line.c_str());
}
} // namespace

int main(int argc, char** argv)
{
    if (argc < 4)
    {
        std::fprintf(stderr, "usage: htn-golden <manifest.tsv> <upstream-root> <scene-root> [case-id...]\n");
        return 2;
    }
    std::ifstream Manifest(argv[1]);
    std::string Line;
    while (std::getline(Manifest, Line))
    {
        if (Line.empty() || Line[0] == '#')
            continue;
        const std::vector<std::string> Columns = Split(Line, '\t');
        if (Columns.size() != 7)
        {
            std::fprintf(stderr, "bad manifest line: %s\n", Line.c_str());
            return 2;
        }
        const Case Row{Columns[0], Columns[1], Columns[2], Columns[3], Columns[4], Columns[5], Columns[6]};
        bool Selected = argc == 4;
        for (int Index = 4; Index < argc; ++Index)
            Selected = Selected || Row.Id == argv[Index];
        if (!Selected)
            continue;
        Run(Row, argv[2], argv[3]);
        std::fflush(stdout);
    }
    return 0;
}
