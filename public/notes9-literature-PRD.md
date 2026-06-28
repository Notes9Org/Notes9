# Notes9 — Literature Search: What to Build (Plain Guide for the Tech Team)

**Who this is for:** the AI / full-stack engineer
**Read this with:** the mockup file `notes9-literature-mockup.html` — open it in a browser. Whenever this guide says *"see the mockup,"* go click that thing. The mockup shows how it should look and feel. This document tells you the rules behind it.

---

## 1. Why we are building this

Researchers read papers at every step of their work. Each time, they do the same 3 steps:

1. **Find** — get papers that match their question.
2. **Pick** — decide which of those papers are worth reading fully.
3. **Read** — get the answer out of the paper, and be sure it is really there.

Right now they use two kinds of tools, and each one only does half the job:

- **Google Scholar** — they trust it because under each result it shows the **real sentences** from the paper. They see the proof with their own eyes. But Scholar can only match keywords. It does not understand a full question.
- **ChatGPT / normal AI** — it understands the question and gives a nice answer. But it does **not** show the exact sentences from the paper. So the user still has to open the paper and check. Or just trust it and hope.

**The problem:** no tool gives both — an AI that understands the question **and** shows the exact words from the paper as proof.

Notes9 already knows the user's whole project. So we can do both. This is the feature that shows Notes9 is different.

> **In one line:** The user asks a normal question. They get an answer. And right next to it, they see the exact sentence from the paper, highlighted in the PDF, with one click. (See the mockup: this is the main thing it does.)

---

## 2. What you are building (open the mockup while you read this)

Open `notes9-literature-mockup.html`. You will see:

- A **search bar** at the top. The user types a normal question, not keywords. *(See the mockup — the question is already typed in.)*
- An **answer box** under the search bar. This is the AI's answer built from all the papers together. Each sentence has a small number you can click. *(See the mockup — the green "Answer across 3 papers" box.)*
- A list of **paper cards**. Each card has the title, the authors, and 3 buttons: **Save**, **Open PDF**, **Open source**. *(See the mockup — the icons on the right of each card.)*
- Each card has **two tabs**: **AI Catalyst** (the main one — it opens first) and **Abstract** (the second one). *(See the mockup — on every card, AI Catalyst is already open. Click "Abstract" to see the second tab.)*
- A **PDF panel** that slides in from the right when the user clicks a citation. *(See the mockup — click any small number chip, or any quoted snippet.)*

That is the whole feature. The rest of this document explains each part.

---

## 3. The two tabs (this is the heart of the feature)

Every paper card has two tabs. *(See the mockup — they sit right under the paper title. AI Catalyst is the one that is open.)*

**Important: the main tab is AI Catalyst. It opens first by default. Abstract is the second tab, behind it.** This is on purpose — we want the user to see the grounded answer first, not the plain abstract.

### Tab 1 (primary — opens by default): AI Catalyst — the new thing
This tab mixes **ChatGPT** style and **Google Scholar** style. It has two parts, stacked on top of each other. *(See the mockup — this tab is already open on every card.)*

**Part A — the short answer (ChatGPT style).**
2 to 4 sentences that answer: *"For my question, what does THIS paper say, and is it useful?"*
- It should start by saying how relevant the paper is (for example: "Directly relevant", "Only a little related", "Says the opposite").
- Each fact in this answer has a small clickable number next to it. *(See the mockup — the little orange numbers.)*

**Part B — the exact lines from the paper (Google Scholar style).**
The **real, word-for-word** sentences from the paper that back up Part A.
- Each one is shown as a quote, with the important words highlighted.
- Each one shows where it came from, like "Results · page 4". *(See the mockup — the boxes that say "Show in PDF".)*

**The most important rule here:**
- Part A can put things in its own words.
- Part B must be the **exact** words from the paper. Never change them.
- If the AI cannot find a real sentence in the paper to back up something in Part A, then **remove that sentence from Part A.** No claim is allowed without proof.

### Tab 2 (secondary): Abstract
- Just shows the paper's real abstract. The exact text. No AI.
- This is the backup view, for when the user wants the plain abstract.
- It is **not** open by default — the user clicks "Abstract" to open it. *(See the mockup — click the "Abstract" tab on any card to bring it forward.)*

---

## 4. Citations — what they are (please read this slowly)

A **citation** is the most important idea in this whole feature. Everything depends on getting it right.

**A citation = a link between something the AI said and the exact spot in the paper that proves it.**

So when the AI says something, a citation connects that sentence to:
- which paper it came from,
- the exact words in that paper,
- and the exact spot in the PDF to jump to.

### What each citation must store
Think of a citation as a small record. It needs to hold:

| What to store | What it means |
|---|---|
| the claim | the AI sentence this citation is backing up |
| paper id | which paper |
| quote | the **exact** words from the paper (do not edit them) |
| highlight part | the most important words in that quote — these get the bright highlight |
| location | for the human to read, like "Results, page 4" |
| jump point | for the computer — the page number and position, so we can scroll to it and highlight it |
| score | how sure we are — used to sort, and to hide weak ones |

### Where citations show up (in many places, not just one)
The same citation idea appears again and again. *(All of these are in the mockup — click around.)*

1. In the **top answer box** — each sentence has a number pointing to the paper it came from. (Different sentences can point to different papers.)
2. In **AI Catalyst Part A** — each fact has a number pointing into that one paper.
3. In **AI Catalyst Part B** — each quote box *is* a citation, shown in full.
4. In the **PDF panel** — this is where the citation takes you. The exact line gets highlighted. *(See the mockup — click a number and watch the PDF open and the line flash.)*
5. **Later** (not now, but build it so this is easy): when a user copies a finding into their notes, report, or paper, the citation should travel with it. So please build the citation record in a clean, reusable way from day one.

### The 3 rules you must never break
1. Every AI sentence the user sees must have at least one citation, and that citation's quote must **really exist** in the paper. Check the quote is truly in the paper text before you show it. If it is not there, do not show that sentence.
2. The words highlighted in the quote box and the words highlighted in the PDF must be **the same words.** The user must see the same proof in both places.
3. Clicking a citation opens the PDF and jumps to that exact line and flashes it. *(See the mockup — this is the key moment.)*

---

## 5. The PDF panel (the side-by-side view)

*(See the mockup — click any citation number or any quote box.)*

How it should work:
- It opens when the user clicks: a citation number, a "Show in PDF" quote, or the "Open PDF" button on a card.
- It slides in from the **right**. The list of papers stays on the left. So the answer and the proof are **side by side**. (On a small phone screen, it can take the full width.)
- When opened **from a citation**: show the page, scroll the right line into the middle, and make it flash so the eye finds it fast. After the flash, keep that line highlighted.
- When opened from the plain "Open PDF" button (no specific line): just start at page 1.
- The user can close it with the X, by clicking the dark background, or by pressing Esc.
- If the panel is already open and the user clicks a different citation, just move to the new line and flash it. Do not reload the whole thing.

---

## 6. What it must do (the checklist)

**Search**
- The search bar takes a normal question and returns papers ranked by how well they match the **meaning** of the question, not just matching words.
- Filters: search my saved library or the web, date range, open-access only. *(See the mockup — the small filter chips under the search bar.)*
- Decide the default: we suggest "my library + web", clearly labelled. Needs product sign-off.

**Results and answer**
- Show the top answer box above the papers, with clickable citation numbers on each sentence.
- Show the paper cards. Top 3 best matches open by default; the rest can be collapsed.
- Each card shows a match score and the basic info (authors, journal, year). *(See the mockup — the match bar on each card.)*

**AI Catalyst**
- The Catalyst text is made fresh for each paper, based on the user's question.
- Part A facts each have a citation number. Part B shows the exact quotes.
- Only build the Catalyst when the user opens that tab (to save cost), and save the result. So if they open it again, or ask the same question again, it loads instantly and is free.

**Citations and PDF**
- Every citation number and quote opens the PDF and highlights the right line.
- Every quote must be the exact text from the paper. Check it is real before showing it.
- Save toggles a paper into the user's project library, and it stays saved.

---

## 7. Questions for product (please answer before building)

- **How can we get the PDFs for all papers? If we cannot get all of them, how do we get the PDF for at least 90% of papers?** This matters a lot. The whole "show the highlighted line in the PDF" feature only works when we actually have the paper's PDF. We need a clear plan for this before we start.
- When we only have the abstract and not the full PDF, do we still show AI Catalyst using just the abstract (clearly labelled), or do we hide it for that paper?
- Where do we get the papers from — which sources or databases — and are we allowed to store their PDFs?
- How many papers open by default, and how many stay collapsed?
- Can the user ask a follow-up question inside one paper now, or is that for later?

---

*Everything in this guide is shown working in `notes9-literature-mockup.html`. Open it, click a citation number or a quote box, and you will see exactly what we mean.*
