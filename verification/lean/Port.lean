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

inductive NativeFamily where
  | inherited | opus
  deriving DecidableEq, Repr

structure NativeModel where
  family : NativeFamily
  effort : Effort
  deriving DecidableEq, Repr

def translate (host : Host) (source : SourceModel) : NativeModel :=
  { family := match host, source.family with
      | .claude, .opus => .opus
      | _, _ => .inherited
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

theorem codex_inherits (source : SourceModel) :
    (translate .codex source).family = .inherited := by
  rfl

theorem claude_opus_preserved (effort : Effort) (fast : Bool) :
    (translate .claude ⟨.opus, effort, fast⟩).family = .opus := by
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
  (match model.family with | .inherited => "inherit-parent" | .opus => "opus") ++
    " " ++ effortText model.effort

def invocation (host : Host) (skill : String) : String :=
  (match host with | .codex => "$pstack:" | .claude => "/pstack:") ++ skill

end Port
