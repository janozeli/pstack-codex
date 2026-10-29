# Generated standalone packages

Edit the shared source in pstack/ and the host compiler in scripts/standalone/, then run node scripts/generate-pstack-harness-trees.mjs. Each package contains native instructions, runtime contracts, skill references, and its own history reader. No runtime translation adapter is installed. Both targets preserve the source skill and playbook inventory.
