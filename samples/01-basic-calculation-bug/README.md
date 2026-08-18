# Sample 1: Basic Logic & Calculation Bug

This sample demonstrates how an AI agent uses basic breakpoints and variable inspection to debug a calculation error in a synchronous function.

## The Problem

In `app.js`, `calculateCartTotal` is failing:
- The cart has 5 items totaling $220.
- With 5 items, the 10% volume discount should apply ($22 off -> $198).
- The `VIP30` coupon should subtract an extra $30 ($168).
- With 10% tax, the expected total is $184.80.
- Instead, the script calculates a completely incorrect total.

## How to Test with AI

1. Open this folder in VS Code:
   ```bash
   code samples/01-basic-calculation-bug
   ```
2. Make sure the VSCode MCP DAP Debugger extension is active (green indicator in status bar).
3. Ask your AI Assistant (Claude Code, Kilocode, Gemini CLI, Cursor, etc.):

> **Sample Prompt:**
> *"Please debug `app.js`. Set a breakpoint in `calculateCartTotal`, start the debug session, step through the calculation line-by-line while inspecting `subtotal`, `totalItemCount`, and `discount`, and fix the bugs."*
