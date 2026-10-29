import Std

namespace Port

inductive Host where
  | codex | claude
  deriving DecidableEq, Repr

inductive Family where
  | opus | grok
  deriving DecidableEq, Repr

inductive Effort where
  | low | medium | high | xhigh | max
  deriving DecidableEq, Repr

structure SourceModel where
  family : Family
  effort : Effort
  fast : Bool
  deriving DecidableEq, Repr

-- Each host keeps the author's two roles on its own models: her Opus seats take
-- the host's strongest model, her Grok seats its fast model.
inductive NativeFamily where
  | opus | haiku | astra | luna
  deriving DecidableEq, Repr

structure NativeModel where
  family : NativeFamily
  effort : Effort
  deriving DecidableEq, Repr

def translate (host : Host) (source : SourceModel) : NativeModel :=
  { family := match host, source.family with
      | .claude, .opus => .opus
      | .claude, .grok => .haiku
      | .codex, .opus => .astra
      | .codex, .grok => .luna
    effort := source.effort }

structure Role (α : Type) where
  name : String
  seats : List α
  deriving DecidableEq, Repr

def translateRole (host : Host) (role : Role SourceModel) : Role NativeModel :=
  { name := role.name, seats := role.seats.map (translate host) }

def translateRoles (host : Host) (roles : List (Role SourceModel)) :=
  roles.map (translateRole host)

theorem effort_preserved (host : Host) (source : SourceModel) :
    (translate host source).effort = source.effort := by
  rfl

theorem claude_opus_preserved (effort : Effort) (fast : Bool) :
    (translate .claude ⟨.opus, effort, fast⟩).family = .opus := by
  rfl

theorem claude_grok_is_haiku (effort : Effort) (fast : Bool) :
    (translate .claude ⟨.grok, effort, fast⟩).family = .haiku := by
  rfl

theorem codex_opus_is_astra (effort : Effort) (fast : Bool) :
    (translate .codex ⟨.opus, effort, fast⟩).family = .astra := by
  rfl

theorem codex_grok_is_luna (effort : Effort) (fast : Bool) :
    (translate .codex ⟨.grok, effort, fast⟩).family = .luna := by
  rfl

theorem fast_does_not_change_model (host : Host) (family : Family) (effort : Effort) :
    translate host ⟨family, effort, true⟩ = translate host ⟨family, effort, false⟩ := by
  rfl

theorem role_names_and_order_preserved (host : Host) (roles : List (Role SourceModel)) :
    (translateRoles host roles).map Role.name = roles.map Role.name := by
  simp [translateRoles, translateRole, List.map_map]

theorem panel_sizes_preserved (host : Host) (role : Role SourceModel) :
    (translateRole host role).seats.length = role.seats.length := by
  simp [translateRole]

theorem panel_efforts_and_order_preserved (host : Host) (role : Role SourceModel) :
    (translateRole host role).seats.map NativeModel.effort = role.seats.map SourceModel.effort := by
  simp [translateRole, translate, List.map_map]

def effortText : Effort → String
  | .low => "low" | .medium => "medium" | .high => "high"
  | .xhigh => "xhigh" | .max => "max"

def render (model : NativeModel) : String :=
  (match model.family with
    | .opus => "opus" | .haiku => "haiku" | .astra => "gpt-6-astra" | .luna => "gpt-6-luna") ++
    " " ++ effortText model.effort

def invocation (host : Host) (skill : String) : String :=
  (match host with | .codex => "$pstack:" | .claude => "/pstack:") ++ skill

def sourceRender (model : SourceModel) : String :=
  (match model.family with | .opus => "claude-opus-5-5" | .grok => "grok-4.7") ++
    "-" ++ effortText model.effort ++ (if model.fast then "-fast" else "")

-- This is the finite lexical grammar, not a finite set of test documents.
-- The verified trace checker applies it to every actual replacement in every
-- document, while its soundness theorem quantifies over arbitrary traces.
def syntaxRules (host : Host) (skills : List String) : List (String × String) :=
  let models := [Family.opus, Family.grok].flatMap fun family =>
    [Effort.low, .medium, .high, .xhigh, .max].flatMap fun effort =>
      [false, true].map fun fast =>
        let model : SourceModel := ⟨family, effort, fast⟩
        (sourceRender model, render (translate host model))
  models ++ skills.map (fun skill => ("/" ++ skill, invocation host skill))

theorem model_rule_present (host : Host) (model : SourceModel) (skills : List String) :
    (syntaxRules host skills).lookup (sourceRender model) = some (render (translate host model)) := by
  rcases model with ⟨family, effort, fast⟩
  cases host <;> cases family <;> cases effort <;> cases fast <;>
    rfl

inductive Aligned (relation : α → β → Prop) : List α → List β → Prop where
  | nil : Aligned relation [] []
  | cons {a as b bs} : relation a b → Aligned relation as bs → Aligned relation (a :: as) (b :: bs)

theorem Aligned.length_eq {relation : α → β → Prop} {as : List α} {bs : List β}
    (h : Aligned relation as bs) : as.length = bs.length := by
  induction h with
  | nil => rfl
  | cons _ _ ih => simp [ih]

def checkList (relation : α → β → Bool) : List α → List β → Bool
  | [], [] => true
  | a :: as, b :: bs => relation a b && checkList relation as bs
  | _, _ => false

theorem checkList_sound (relation : α → β → Bool) (as : List α) (bs : List β)
    (h : checkList relation as bs = true) : Aligned (fun a b => relation a b = true) as bs := by
  induction as generalizing bs with
  | nil =>
    cases bs with
    | nil => exact .nil
    | cons b bs => simp [checkList] at h
  | cons a as ih =>
    cases bs with
    | nil => simp [checkList] at h
    | cons b bs =>
      simp only [checkList, Bool.and_eq_true] at h
      exact .cons h.1 (ih bs h.2)

theorem checkList_complete (relation : α → β → Bool) (as : List α) (bs : List β)
    (h : Aligned (fun a b => relation a b = true) as bs) : checkList relation as bs = true := by
  induction h with
  | nil => rfl
  | cons hr _ ih => simp [checkList, hr, ih]

def checkRoles (rules : List (String × String)) (source native : List (Role String)) : Bool :=
  checkList (fun a b => a.name == b.name &&
    checkList (fun x y => rules.lookup x == some y) a.seats b.seats) source native

theorem checkRoles_sound (rules : List (String × String)) (source native : List (Role String))
    (h : checkRoles rules source native = true) :
    Aligned (fun a b => a.name = b.name ∧
      Aligned (fun x y => rules.lookup x = some y) a.seats b.seats) source native := by
  have aligned := checkList_sound _ source native h
  clear h
  induction aligned with
  | nil => exact .nil
  | cons hr _ ih =>
    simp only [Bool.and_eq_true, beq_iff_eq] at hr
    constructor
    · exact ⟨hr.1, by simpa only [beq_iff_eq] using checkList_sound _ _ _ hr.2⟩
    · exact ih

theorem checkRoles_count (rules : List (String × String)) (source native : List (Role String))
    (h : checkRoles rules source native = true) : source.length = native.length :=
  (checkRoles_sound rules source native h).length_eq

end Port
