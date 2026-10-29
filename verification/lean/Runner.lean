import Lean
import Verified

open Lean

deriving instance FromJson for Translation.Chunk
deriving instance FromJson for Translation.Step
deriving instance FromJson for Translation.Entry
deriving instance FromJson for Port.Role

structure Document where
  path : String
  input : String
  output : String
  steps : List Translation.Step
  deriving FromJson

structure Bundle where
  sourceRoles : List (Port.Role String)
  nativeRoles : List (Port.Role String)
  tree : String
  skills : List String
  traces : List Document
  expected : List Translation.Entry
  actual : List Translation.Entry
  produced : List Translation.Entry
  deriving FromJson

def verify (b : Bundle) : Except String Unit := do
  let host ← match b.tree with
    | "codex" => pure Port.Host.codex
    | "claude-code" => pure Port.Host.claude
    | other => throw s!"Unknown host: {other}"
  if b.expected.isEmpty || b.traces.isEmpty || b.skills.isEmpty then
    throw "Empty artifact coverage"
  if !Translation.checkPackage b.expected b.actual then
    throw s!"{b.tree}: distributed inventory rejected"
  if !Translation.checkPackage b.expected b.produced then
    throw s!"{b.tree}: renderer inventory rejected"
  let rules := Port.syntaxRules host b.skills
  if b.sourceRoles.isEmpty || !Port.checkRoles rules b.sourceRoles b.nativeRoles then
    throw s!"{b.tree}: role configuration rejected"
  let allowed := Translation.allowed rules
  for document in b.traces do
    if !Translation.checkTrace allowed document.input document.steps document.output then
      throw s!"{b.tree}/{document.path}: rewrite trace rejected"

-- Only I/O and decoding live here. The checking functions are exactly those
-- whose general soundness theorems were checked and audited in Verified.olean.
def main (args : List String) : IO UInt32 := do
  let [path] := args | throw (IO.userError "Usage: Runner.lean EVIDENCE.json")
  let input ← IO.FS.readFile path
  let decoded : Except String (List Bundle) := do
    let json ← Json.parse input
    fromJson? json
  let bundles ← match decoded with
    | .ok value => pure value
    | .error error => throw (IO.userError s!"Invalid evidence: {error}")
  if bundles.isEmpty then throw (IO.userError "Empty evidence")
  for bundle in bundles do
    match verify bundle with
    | .error error => throw (IO.userError error)
    | .ok () => IO.println s!"PASS: {bundle.tree}: {bundle.actual.length} files, {bundle.traces.length} complete rewrite chains"
  return 0
