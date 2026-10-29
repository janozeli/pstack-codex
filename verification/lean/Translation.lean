import Std

namespace Translation

structure Chunk where
  keep : String
  before : String
  after : String
  deriving Repr

def source : List Chunk → String → String
  | [], tail => tail
  | c :: cs, tail => c.keep ++ c.before ++ source cs tail

def target : List Chunk → String → String
  | [], tail => tail
  | c :: cs, tail => c.keep ++ c.after ++ target cs tail

-- A contextual lifting: the ONLY differences are related replacements.
-- Unchanged prefixes are identical, ordered, and cover the complete input.
inductive Framed (R : String → String → Prop) : String → String → Prop where
  | done (tail) : Framed R tail tail
  | edit (keep before after rest rest') : R before after → Framed R rest rest' →
      Framed R (keep ++ before ++ rest) (keep ++ after ++ rest')

theorem frame_sound (R : String → String → Prop) (cs : List Chunk) (tail : String)
    (h : ∀ c ∈ cs, R c.before c.after) : Framed R (source cs tail) (target cs tail) := by
  induction cs with
  | nil => exact .done tail
  | cons c cs ih =>
    exact .edit c.keep c.before c.after _ _ (h c (by simp))
      (ih (fun d hd => h d (by simp [hd])))

-- Accounting for every inserted and removed character: no unreported loss.
def removed : List Chunk → Nat
  | [] => 0
  | c :: cs => c.before.length + removed cs

def inserted : List Chunk → Nat
  | [] => 0
  | c :: cs => c.after.length + inserted cs

theorem frame_accounting (cs : List Chunk) (tail : String) :
    (source cs tail).length + inserted cs = (target cs tail).length + removed cs := by
  induction cs with
  | nil => simp [source, target, inserted, removed]
  | cons c cs ih =>
    simp only [source, target, inserted, removed, String.length_append]
    omega

-- Independent semantic interpretation. A rule's semantic justification may be
-- supplied later; the lifting theorem is not a claim about natural language.
theorem frame_refines (R S : String → String → Prop)
    (refl : ∀ t, S t t)
    (congr : ∀ k a b r r', R a b → S r r' → S (k ++ a ++ r) (k ++ b ++ r'))
    {a b : String} (h : Framed R a b) : S a b := by
  induction h with
  | done tail => exact refl tail
  | edit k a b r r' hr _ ih => exact congr k a b r r' hr ih

-- Framing is symmetric if the rule relation is reversed. This gives an exact
-- reconstruction certificate, including deletions and insertions.
theorem frame_reverse {R : String → String → Prop} {a b : String}
    (h : Framed R a b) : Framed (fun x y => R y x) b a := by
  induction h with
  | done tail => exact .done tail
  | edit k a b r r' hr _ ih => exact .edit k b a r' r hr ih

structure Step where
  chunks : List Chunk
  tail : String
  output : String
  deriving Repr

theorem accepted_step_decomposition (input : String)
    (s : Step) (h : (input == source s.chunks s.tail && s.output == target s.chunks s.tail) = true) :
    input = source s.chunks s.tail ∧ s.output = target s.chunks s.tail := by
  simpa only [Bool.and_eq_true, beq_iff_eq] using h

-- A concrete syntax contract constrains recognized model/command replacements.
-- Prose rewrites remain reviewed policy, rather than claiming natural-language
-- equivalence. Rule labels supplied by the compiler cannot bypass this lookup.
def allowed (rules : List (String × String)) (before after : String) : Bool :=
  match rules.lookup before with
  | none => true
  | some expected => after == expected

theorem allowed_contract (rules : List (String × String)) (before after expected : String)
    (lookup : rules.lookup before = some expected)
    (accepted : allowed rules before after = true) : after = expected := by
  simpa [allowed, lookup] using accepted

def checkStep (allowed : String → String → Bool) (input : String) (s : Step) : Bool :=
  input == source s.chunks s.tail && s.output == target s.chunks s.tail &&
    s.chunks.all (fun c => allowed c.before c.after)

theorem checkStep_sound (allowed : String → String → Bool) (input : String) (s : Step)
    (h : checkStep allowed input s = true) :
    Framed (fun a b => allowed a b = true) input s.output := by
  simp only [checkStep, Bool.and_eq_true, beq_iff_eq, List.all_eq_true] at h
  obtain ⟨⟨hi, ho⟩, hr⟩ := h
  rw [hi, ho]
  exact frame_sound _ _ _ hr

theorem accepted_step_contract (rules : List (String × String)) (input : String) (s : Step)
    (h : checkStep (allowed rules) input s = true) (c : Chunk) (mem : c ∈ s.chunks)
    (expected : String) (lookup : rules.lookup c.before = some expected) : c.after = expected := by
  simp only [checkStep, Bool.and_eq_true, List.all_eq_true] at h
  exact allowed_contract rules c.before c.after expected lookup (h.2 c mem)

inductive Pipeline (R : String → String → Prop) : String → String → Prop where
  | done (s) : Pipeline R s s
  | step {a b c} : Framed R a b → Pipeline R b c → Pipeline R a c

def checkTrace (allowed : String → String → Bool) : String → List Step → String → Bool
  | input, [], output => input == output
  | input, s :: ss, output => checkStep allowed input s && checkTrace allowed s.output ss output

theorem checkTrace_sound (allowed : String → String → Bool) (ss : List Step) (input output : String)
    (h : checkTrace allowed input ss output = true) :
    Pipeline (fun a b => allowed a b = true) input output := by
  induction ss generalizing input with
  | nil => simp [checkTrace] at h; subst output; exact .done input
  | cons s ss ih =>
    simp only [checkTrace, Bool.and_eq_true] at h
    exact .step (checkStep_sound allowed input s h.1) (ih s.output h.2)

theorem pipeline_refines (R S : String → String → Prop)
    (refl : ∀ t, S t t)
    (trans : ∀ a b c, S a b → S b c → S a c)
    (congr : ∀ k a b r r', R a b → S r r' → S (k ++ a ++ r) (k ++ b ++ r'))
    {a b : String} (h : Pipeline R a b) : S a b := by
  induction h with
  | done s => exact refl s
  | step hs _ ih => exact trans _ _ _ (frame_refines R S refl congr hs) ih

-- Equal replacements cannot change ANY part of the document, for arbitrary
-- trace lengths and arbitrary strings, not just a finite fixture corpus.
theorem frame_identity {a b : String} (h : Framed Eq a b) : a = b := by
  induction h with
  | done => rfl
  | edit k a b r r' hab _ ih => rw [hab, ih]

theorem pipeline_identity {a b : String} (h : Pipeline Eq a b) : a = b := by
  induction h with
  | done => rfl
  | step hs _ ih => exact (frame_identity hs).trans ih

-- Package content identifiers are injectively interned from exact bytes by the
-- I/O bridge. Neither cryptographic hashes nor native decisions enter proofs.
structure Entry where
  path : Nat
  content : Nat
  executable : Bool
  deriving DecidableEq, BEq, ReflBEq, LawfulBEq, Repr

-- Canonical inventories use injectively interned path IDs in ascending order.
-- Checking adjacent keys is linear, unlike pairwise duplicate checks.
def ordered : List Entry → Bool
  | [] => true
  | [_] => true
  | a :: b :: rest => decide (a.path < b.path) && ordered (b :: rest)

theorem ordered_head (a : Entry) (rest : List Entry) (h : ordered (a :: rest) = true) :
    ∀ b ∈ rest, a.path < b.path := by
  induction rest generalizing a with
  | nil => simp
  | cons b rest ih =>
    simp only [ordered, Bool.and_eq_true, decide_eq_true_eq] at h
    intro c hc
    simp only [List.mem_cons] at hc
    rcases hc with rfl | hc
    · exact h.1
    · exact Nat.lt_trans h.1 (ih b h.2 c hc)

theorem ordered_unique (entries : List Entry) (h : ordered entries = true) :
    (entries.map Entry.path).Nodup := by
  induction entries with
  | nil => simp
  | cons a rest ih =>
    rw [List.map_cons, List.nodup_cons]
    constructor
    · intro mem
      obtain ⟨b, hb, heq⟩ := List.mem_map.mp mem
      have lt := ordered_head a rest h b hb
      omega
    · apply ih
      cases rest with
      | nil => rfl
      | cons b rest =>
        simp only [ordered, Bool.and_eq_true] at h
        exact h.2

def checkPackage (expected actual : List Entry) : Bool :=
  expected == actual && ordered expected

theorem checkPackage_sound (expected actual : List Entry)
    (h : checkPackage expected actual = true) :
    expected.Perm actual ∧ (actual.map Entry.path).Nodup := by
  simp only [checkPackage, Bool.and_eq_true, beq_iff_eq] at h
  rcases h with ⟨rfl, orderedProof⟩
  exact ⟨List.Perm.refl _, ordered_unique _ orderedProof⟩

theorem package_no_extra (expected actual : List Entry)
    (h : checkPackage expected actual = true) (entry : Entry) (mem : entry ∈ actual) :
    entry ∈ expected := (checkPackage_sound expected actual h).1.mem_iff.mpr mem

theorem package_complete (expected actual : List Entry)
    (h : checkPackage expected actual = true) (entry : Entry) (mem : entry ∈ expected) :
    entry ∈ actual := (checkPackage_sound expected actual h).1.mem_iff.mp mem

theorem package_unique (expected actual : List Entry)
    (h : checkPackage expected actual = true) : (actual.map Entry.path).Nodup :=
  (checkPackage_sound expected actual h).2

theorem package_size (expected actual : List Entry)
    (h : checkPackage expected actual = true) : expected.length = actual.length :=
  (checkPackage_sound expected actual h).1.length_eq

end Translation
