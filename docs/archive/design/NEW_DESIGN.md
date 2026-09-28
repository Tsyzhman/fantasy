---
type: reference
project: Isty
title: Isty Design System
style: Isty Cloudline
themes:
  light: Cloud Day
  dark: Cloud Night
date: 2026-08-18
status: canonical
replaces: Retro Orbit Editorial
optional_visual_examples:
  light: ISTY_CLOUDLINE_PREVIEW.html
  dark: ISTY_CLOUDLINE_DARK_PREVIEW.html
---

# Design system Isty

> Archived reference. For the current product, start at [the project README](../../../README.md) and [the specification map](../../../specs/SPEC-MAP.md).

This document establishes a unified visual language **Isty Cloudline** for landing pages, presentations, commercial offers, documents, cases, internal interfaces and materials on social networks.

The system has two equal topics:

- **Cloud Day** - light, airy and daytime;
- **Cloud Night** - dark, deep and calm.

Both themes use the same typography, grid, component logic, states, and visual metaphors. It is not the structure of the interface that changes, but the atmosphere: background, surfaces, contrast, depth and intensity of accents.

The system should give three sensations at the same time:

- **easy to read** - high contrast, calm typography, short lines and a lot of air;
- **nice to look at** - soft light, heavenly shades, neat depth and small warm details;
- **can be trusted** - strict grid, clear hierarchy, real processes and absence of decorative noise.

Visual examples:

- light theme: `ISTY_CLOUDLINE_PREVIEW.html`;
- dark theme: `ISTY_CLOUDLINE_DARK_PREVIEW.html`.

---

## 1. Main idea

The style is called **Isty Cloudline**.

This is an interface-editing system for a company that turns complex processes into an understandable working environment. It can be light or dark, but in both modes it retains a feeling of air, clarity and calm forward movement.

Visually, the style connects:

- light day or deep night foundation;
- blue-graphite neutral scale;
- sky blue main accent;
- soft lavender second accent;
- mint statuses and confirmations;
- warm sunny micro-accents;
- large but calm typography;
- rounded functional surfaces;
- thin routes, links and nodes;
- real human scenes;
- a feeling of clarity, space and forward movement.

Main emotion:

> **Complex work has become clear, calm and manageable.**

The cloud here is not a literal illustration or a set of weather icons. This is the principle of the environment: a lot of air, soft boundaries, distributed light and the feeling that the system does not put pressure on the person.

### 1.1. Two topics

| Theme | Character | Best suited |
|---|---|---|
| **Cloud Day** | light, openness, daytime clarity | long pages, documents, cases, commercial offers, working interfaces |
| **Cloud Night** | depth, focus, soft night glow | covers, presentations, product screens, demonstrations, entire landing pages with a more emotional presentation |

Topics are equal. The choice depends on the task, viewing environment and mood of the material, and not on the “main / service” hierarchy.

### 1.2. What should it feel

- clear;
- easy;
- calmly;
- modern;
- kindly;
- professional;
- technological without coldness;
- is lively without immaturity.

### 1.3. Principles of equality of topics

- the same component has the same role in both themes;
- state does not change meaning when changing the topic;
- dark theme is not a mechanical inversion of light theme;
- light theme does not turn into an all-white sterile sheet;
- the dark theme is based on night blue, and not on absolute black;
- in both themes the background is quieter than the content;
- contrast is checked separately for each topic;
- Density, radii, dimensions and typographic hierarchy remain the same.

### 1.4. What is no longer in the system?

- poster aggression;
- slanted cap in each large heading;
- heavy black mass;
- grainy printed texture;
- space and orbits as the main metaphor;
- rigid division of the screen into color zones;
- sharp rectangular cards;
- neon and cyberpunk in a dark theme;
- decorative interface panels without function.

---

## 2. Brand core

### 2.1. Who are we

**Isty is an AI automation studio that designs workflows for processes, integrations, interfaces and communication of decisions to the team.**

We collect:

- process maps;
- roles and areas of responsibility;
- scenarios and exceptions;
- integration between services;
- interfaces for the command;
- event logs and statuses;
- instructions for transfer;
- AI assistants and automation where it enhances the process.

### 2.2. Promise

Isty helps businesses assemble a work system around people: roles become clear, routine goes into the process, and the team sees the next step.

### 2.3. Semantic supports

| Support | What does | mean How does it appear visually |
|---|---|---|
| Clarity | It's clear at first glance what's going on | strong hierarchy, short texts, clean diagrams |
| Lightness | The system does not overload the person | light base, air, soft surfaces |
| Contour | The process has boundaries and a route | connection lines, steps, statuses, structure cards |
| People | Automation supports team | real working scenes, human text |
| Transfer | The result can be developed further | documentation, checklists, clear interfaces |
| Movement | The next step is always visible | accent actions, progress, active route |

---

## 3. Visual Grammar

Cloudline is built as a **quiet work environment**, which can be day or night.

### 3.1. Basic elements

| Element | Role | Cloud Day | Cloud Night |
|---|---|---|---|
| Air | creates calm | light fields and large indents | free dark fields without unnecessary glow |
| Cloud | creates soft depth | blue and lavender blurred areas | muted areas of light within blue depth |
| Surface | holds information | white or lightly tinted card | blue graphite card with thin border |
| Route | shows the process | thin gray-blue line | muted blue line with local active glow |
| Warm spot | adds mood | sunny mark or human detail | golden mark or warm light in a photo |
| Contrast | maintains hierarchy | dark text on light backgrounds | light text on deep surfaces |

### 3.2. Basic compositional formula

```text
спокойная среда
+ один сильный смысловой блок
+ одна рабочая визуализация
+ один очевидный следующий шаг
+ небольшая тёплая деталь
```

The formula does not change when switching themes.

### 3.3. Density limit

The following are allowed simultaneously on one screen:

- one main heading;
- one semantic lead;
- one main visual scene;
- one main CTA;
- up to three secondary information blocks;
- no more than two levels of nesting of cards.

If the screen requires eight floating cards, the composition must be reassembled.

### 3.4. Switching topics within a material

- One main topic is selected for one medium;
- the opposite theme can be used for the cover, divider or one semantic section;
- you cannot alternate light and dark backgrounds for each subsequent section;
- product interface can have a custom switch;
- When changing the theme, the structure, order and sizes of the components do not change;
- The transition between themes should occupy `160–240ms` and affect only the color, borders, shadows and background.

---

## 4. Color and theme system

### 4.1. Token architecture

Colors are divided into three levels:

1. **Brand scales** - sky, lavender, mint, sun and danger.
2. **Semantic tokens** - background, surface, text, frame, action, success, attention and error.
3. **Component tokens** - button background, hero surface, focus ring, shadow and other local solutions.

Components use only semantic and component tokens. Values ​​like `#ffffff`, `#17243a`, or `rgba(...)` should not be scattered across component styles.

### 4.2. Brand accents

| Family | Meaning | Light theme | Dark theme |
|---|---|---:|---:|
| `sky` | action, route, link, active stage | `#4776b7` | `#89b7ef` |
| `lavender` | analysis, AI, research | `#765eb5` | `#b8a8ee` |
| `mint` | readiness, success, confirmation | `#39755d` | `#91d3b5` |
| `sun` | attention, warm human detail | `#d9a842` | `#efc56d` |
| `danger` | error, risk, blocking state | `#a34550` | `#f0a0ac` |

In a dark theme, the accents become lighter, but not brighter in area: the color takes up less space and works accurately.

### 4.3. Cloud Day - semantic palette

| Token | Value | Role |
|---|---:|---|
| `bg-page` | `#f4f8fd` | main page background |
| `bg-page-alt` | `#fbfdff` | light depth change |
| `surface-1` | `#ffffff` | main surface |
| `surface-2` | `#f7faff` | secondary surface |
| `surface-3` | `#eef4fb` | selected or nested surface |
| `text-primary` | `#1f2a3d` | headings and body text |
| `text-secondary` | `#3d4b61` | leads and secondary text |
| `text-muted` | `#61718a` | signatures and metadata |
| `border` | `#dce6f1` | regular frame |
| `border-strong` | `#bdd5fa` | active frame |
| `accent-primary` | `#4776b7` | primary interactive color |
| `accent-primary-strong` | `#365f98` | hover and thick accent |
| `accent-primary-soft` | `#e3eeff` | soft blue background |
| `accent-secondary` | `#765eb5` | second active color |
| `accent-secondary-soft` | `#f0ebff` | lavender surface |
| `success` | `#39755d` | successful status |
| `success-soft` | `#e6f6ee` | successful status background |
| `warning` | `#7b5a13` | warning text |
| `warning-soft` | `#fff4d8` | warning background |
| `danger` | `#a34550` | error |
| `danger-soft` | `#fdebed` | error background |

### 4.4. Cloud Night - semantic palette

| Token | Value | Role |
|---|---:|---|
| `bg-page` | `#0d1727` | main night background |
| `bg-page-alt` | `#111d30` | soft depth change |
| `surface-1` | `#142137` | main surface |
| `surface-2` | `#17243a` | raised surface |
| `surface-3` | `#1b2b44` | selected or nested surface |
| `text-primary` | `#f1f6ff` | headings and body text |
| `text-secondary` | `#c6d1e1` | leads and secondary text |
| `text-muted` | `#91a2ba` | signatures and metadata |
| `border` | `rgba(159,185,220,.18)` | regular frame |
| `border-strong` | `#638fc8` | active frame |
| `accent-primary` | `#89b7ef` | primary interactive color |
| `accent-primary-strong` | `#a4ccfb` | hover and thick accent |
| `accent-primary-soft` | `#1d3555` | blue night surface |
| `accent-secondary` | `#b8a8ee` | second active color |
| `accent-secondary-soft` | `#292443` | lavender night surface |
| `success` | `#91d3b5` | successful status |
| `success-soft` | `#17372f` | successful status background |
| `warning` | `#efc56d` | warning |
| `warning-soft` | `#3b3120` | warning background |
| `danger` | `#f0a0ac` | error |
| `danger-soft` | `#3b2028` | error background |

### 4.5. CSS tokens for both themes

```css
:root,
html[data-theme="light"] {
  color-scheme: light;

  --bg-page: #f4f8fd;
  --bg-page-alt: #fbfdff;
  --surface-1: #ffffff;
  --surface-2: #f7faff;
  --surface-3: #eef4fb;

  --text-primary: #1f2a3d;
  --text-secondary: #3d4b61;
  --text-muted: #61718a;

  --border: #dce6f1;
  --border-strong: #bdd5fa;

  --accent-primary: #4776b7;
  --accent-primary-strong: #365f98;
  --accent-primary-soft: #e3eeff;
  --accent-secondary: #765eb5;
  --accent-secondary-soft: #f0ebff;

  --success: #39755d;
  --success-soft: #e6f6ee;
  --warning: #7b5a13;
  --warning-soft: #fff4d8;
  --danger: #a34550;
  --danger-soft: #fdebed;

  --button-primary-text: #ffffff;
  --button-primary-bg:
    linear-gradient(135deg, #4776b7 0%, #6f63b2 100%);
  --button-primary-bg-hover:
    linear-gradient(135deg, #365f98 0%, #5f4f9d 100%);

  --focus-ring: rgba(71, 118, 183, .18);
  --shadow-sm:
    0 1px 2px rgba(31, 42, 61, .04),
    0 6px 18px rgba(54, 95, 152, .06);
  --shadow-md:
    0 2px 4px rgba(31, 42, 61, .04),
    0 16px 40px rgba(54, 95, 152, .09);

  --page-atmosphere:
    radial-gradient(62% 42% at 8% 0%, rgba(189,213,250,.58), transparent 72%),
    radial-gradient(48% 34% at 92% 10%, rgba(213,201,248,.46), transparent 74%),
    linear-gradient(180deg, #fbfdff 0%, #f4f8fd 48%, #ffffff 100%);

  --hero-atmosphere:
    radial-gradient(72% 68% at 20% 8%, rgba(227,238,255,.95), transparent 72%),
    radial-gradient(58% 62% at 90% 88%, rgba(240,235,255,.90), transparent 74%),
    rgba(255,255,255,.86);
}

html[data-theme="dark"] {
  color-scheme: dark;

  --bg-page: #0d1727;
  --bg-page-alt: #111d30;
  --surface-1: #142137;
  --surface-2: #17243a;
  --surface-3: #1b2b44;

  --text-primary: #f1f6ff;
  --text-secondary: #c6d1e1;
  --text-muted: #91a2ba;

  --border: rgba(159, 185, 220, .18);
  --border-strong: #638fc8;

  --accent-primary: #89b7ef;
  --accent-primary-strong: #a4ccfb;
  --accent-primary-soft: #1d3555;
  --accent-secondary: #b8a8ee;
  --accent-secondary-soft: #292443;

  --success: #91d3b5;
  --success-soft: #17372f;
  --warning: #efc56d;
  --warning-soft: #3b3120;
  --danger: #f0a0ac;
  --danger-soft: #3b2028;

  --button-primary-text: #0c1726;
  --button-primary-bg:
    linear-gradient(135deg, #93c2f7 0%, #bba9ef 100%);
  --button-primary-bg-hover:
    linear-gradient(135deg, #acd2fb 0%, #cabaf3 100%);

  --focus-ring: rgba(137, 183, 239, .22);
  --shadow-sm:
    0 1px 2px rgba(0, 0, 0, .16),
    0 10px 28px rgba(2, 8, 20, .24);
  --shadow-md:
    0 2px 4px rgba(0, 0, 0, .18),
    0 22px 58px rgba(2, 8, 20, .32);

  --page-atmosphere:
    radial-gradient(58% 42% at 8% 0%, rgba(79,124,182,.30), transparent 74%),
    radial-gradient(48% 36% at 92% 8%, rgba(122,100,182,.26), transparent 75%),
    radial-gradient(40% 28% at 48% 44%, rgba(56,105,145,.13), transparent 78%),
    linear-gradient(180deg, #0d1727 0%, #111d30 48%, #0c1626 100%);

  --hero-atmosphere:
    radial-gradient(72% 68% at 16% 8%, rgba(47,82,126,.52), transparent 72%),
    radial-gradient(58% 62% at 90% 88%, rgba(82,65,126,.48), transparent 74%),
    rgba(17,28,46,.80);
}
```

### 4.6. Choosing a theme

| Situation | Recommended topic | Acceptable alternative |
|---|---|---|
| Long read, documentation | Cloud Day | Cloud Night with custom selection |
| Commercial offer | Cloud Day | dark cover + light content |
| Landing page | any, depending on the nature of the message | separate sections of the opposite topic |
| Presentation cover | Cloud Night | Cloud Day with a more formal presentation |
| Product interface | user selection | device system theme |
| Process demonstration | any | theme environment in which the demo is shown |
| Social networks | any | series can alternate topics between publications |

### 4.7. Color balance

**Cloud Day:**

- 68–78% - light neutrals and surfaces;
- 10–15% - sky blue;
- 5–8% — lavender;
- 2–4% - mint;
- to 2% - sunny accent.

**Cloud Night:**

- 72–82% — deep blue neutrals;
- 8–12% - lighter surfaces;
- 4–7% - heavenly accent;
- 3–5% - lavender or mint;
- to 2% - sunny accent.

You don't need to use all the accent colors at the same time on one screen. Basic link: `sky + один дополнительный акцент`.

### 4.8. Contrast

- plain text: not lower than `4.5:1`;
- large text: not lower than `3:1`;
- `text-muted` is used only for secondary information, but maintains a contrast not lower than `4.5:1` on the main background;
- pastel and dark soft surfaces are used as a background, and not as the color of small text;
- status cannot be conveyed only in color: you need text, an icon or a form next to it;
- dark theme is checked separately and is not considered correct after automatic token replacement;
- pure white `#ffffff` is not used for all dark theme text: base color is `#f1f6ff`;
- absolute black `#000000` is not used as the main background.

### 4.9. Switch implementation

- theme is specified via `html[data-theme="light"]` or `html[data-theme="dark"]`;
- if there is no user selection, `prefers-color-scheme` can be taken into account;
- user selection is saved;
- before initializing the interface, the theme is set to `<head>` so that there is no light flash;
- `filter: invert(...)` and automatic image conversion are prohibited;
- When switching, only `color`, `background-color`, `border-color`, `box-shadow` and the opacity of the background areas are animated.

---

## 5. Background and cloudy atmosphere

### 5.1. Main page background

```css
body {
  color: var(--text-primary);
  background: var(--page-atmosphere);
}
```

The background creates an environment, but does not become an independent illustration.

### 5.2. Cloud Day

The light theme is built on a milky white and cold cloudy background.

Rules:

- the central text areas remain almost neutral;
- blue and lavender blur are located closer to the edges or behind large visual scenes;
- white surfaces are separated by a frame and a small shadow;
- gray should not take over the entire page;
- background should not look like a medical or banking template.

### 5.3. Cloud Night

The dark theme is based on deep night blue, rather than black.

Rules:

- main depth: `#0d1727 → #111d30`;
- light areas are subdued and wide;
- blue or lavender glow is not used around each component;
- surfaces are separated by a frame, a difference in brightness and a very soft shadow;
- under long text the background becomes smoother;
- no more than two noticeable light areas in one viewport;
- The dark theme should feel calm, not gamey or cyberpunk.

### 5.4. Cloud areas

A cloud area is a large, washed-out patch of color that creates depth without competing with text.

Rules:

- area size: from `320px` to `900px`;
- blur: `48–96px`;
- opacity in Cloud Day: `0.18–0.55`;
- opacity in Cloud Night: `0.10–0.32`;
- no more than three areas in one viewport;
- under small text the background remains almost neutral;
- The cloud should not look like a literal cloud icon;
- The edges of the areas should not form a noticeable band.

### 5.5. Structural mesh

Very fine mesh is allowed in process and technical blocks:

```css
.process-surface {
  background-image:
    linear-gradient(color-mix(in srgb, var(--accent-primary) 6%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--accent-primary) 6%, transparent) 1px, transparent 1px);
  background-size: 48px 48px;
}
```

Text pages do not need a grid. In a dark theme, its contrast should be lower than in a light one.

### 5.6. What is prohibited

- cloudy gray background throughout the page;
- absolute black background;
- blur directly below small text;
- excessive glassmorphism;
- cards that do not separate from the background;
- rainbow gradients;
- many small colored spots;
- literal clouds clipart;
- neomorphism with poorly readable boundaries;
- neon glow around each active element;
- stars, cosmic dust and sci-fi as a constant background of Cloud Night.

---

## 6. Typography

The typographic system is the same for Cloud Day and Cloud Night. The theme changes the color of the text, but not the size, weight, rhythm or length of lines.

### 6.1. Headsets

Main headset: **Onest**.

Fallback:

```css
font-family: Onest, Inter, system-ui, -apple-system, BlinkMacSystemFont,
  "Segoe UI", sans-serif;
```

Technical headset: **JetBrains Mono**.

It is used only for:

- ID;
- time;
- integration statuses;
- short technical marks;
- code;
- step numbers.

### 6.2. Hero H1

```css
font-size: clamp(48px, 6vw, 84px);
font-weight: 700;
font-style: normal;
letter-spacing: -0.04em;
line-height: 1.04;
color: var(--text-primary);
text-wrap: balance;
```

Rules:

- normal case, not caps;
- without tilt;
- three lines maximum;
- landmark: 6–14 words;
- keyword can be selected `accent-primary-strong` or `accent-secondary`;
- transfers are checked manually;
- the headline should sound like a clear promise, not an advertising slogan;
- in Cloud Night the title has no glow or text shadow.

### 6.3. H2

```css
font-size: clamp(36px, 4.2vw, 56px);
font-weight: 680;
letter-spacing: -0.032em;
line-height: 1.08;
color: var(--text-primary);
text-wrap: balance;
```

### 6.4. H3

```css
font-size: clamp(24px, 2.2vw, 32px);
font-weight: 650;
letter-spacing: -0.02em;
line-height: 1.16;
color: var(--text-primary);
```

### 6.5. Lead

```css
font-size: clamp(19px, 1.8vw, 23px);
line-height: 1.5;
color: var(--text-secondary);
max-width: 56ch;
```

### 6.6. Main text

```css
font-size: 17px;
line-height: 1.65;
color: var(--text-secondary);
max-width: 68ch;
```

For documents, `16px / 1.65` is allowed.

### 6.7. UI text

| Item | Size | Weight | Spacing |
|---|---:|---:|---:|
| Navigation | `14px` | `600` | `1.4` |
| Button | `15px` | `650` | `1` |
| Field signature | `13px` | `600` | `1.35` |
| Field text | `16px` | `500` | `1.4` |
| Status | `13px` | `600` | `1.2` |
| Metadata | `12px` | `550` | `1.35` |
| Mono tag | `11–12px` | `500` | `1.35` |

### 6.8. Line length

- plain text: `55–68ch`;
- lead: `42–56ch`;
- text inside the card: `28–44ch`;
- table line: within the meaning, without artificial stretching;
- on mobile text should not be pressed against the edges of the screen.

### 6.9. Color hierarchy

| Role | Token |
|---|---|
| Title and key number | `text-primary` |
| Body paragraph and lead | `text-secondary` |
| Metadata and signature | `text-muted` |
| Link and active text | `accent-primary-strong` |
| Analytical isolation | `accent-secondary` |
| Successful status | `success` |

### 6.10. What not to use

- long paragraphs, full screen width;
- caps for section headings;
- italics as a permanent character of the brand;
- weight `800–900` for no particular reason;
- low contrast text;
- pure white for all Cloud Night text;
- centering long text;
- monospace font for the sake of atmosphere;
- glow, outline or shadow around the title in a dark theme.

---

## 7. Grid, widths and paddings

Geometry does not change between themes.

### 7.1. Container

```css
.container {
  width: min(100% - 48px, 1240px);
  margin-inline: auto;
}
```

On mobile:

```css
.container {
  width: min(100% - 32px, 1240px);
}
```

### 7.2. Main grid

Desktop:

```css
display: grid;
grid-template-columns: repeat(12, minmax(0, 1fr));
gap: 24px;
```

Tablet:

```css
grid-template-columns: repeat(8, minmax(0, 1fr));
gap: 20px;
```

Mobile:

```css
grid-template-columns: repeat(4, minmax(0, 1fr));
gap: 16px;
```

### 7.3. Vertical rhythm

| Level | Desktop | Tablet | Mobile |
|---|---:|---:|---:|
| Between large sections | `112px` | `80px` | `56px` |
| Inside section | `48px` | `40px` | `32px` |
| Between semantic blocks | `32px` | `28px` | `24px` |
| Between related elements | `16px` | `16px` | `12px` |
| Microinterval | `8px` | `8px` | `8px` |

### 7.4. Radii

```css
--radius-sm: 10px;
--radius-md: 16px;
--radius-lg: 24px;
--radius-xl: 32px;
--radius-pill: 999px;
```

Rules:

- buttons and fields: `12–16px`;
- cards: `20–24px`;
- large hero-surface: `28–32px`;
- pill is used only for tags and statuses;
- You cannot mix five different radii in one block.

### 7.5. Depth

```css
.surface {
  border: 1px solid var(--border);
  background: var(--surface-1);
  box-shadow: var(--shadow-sm);
}
```

Cloud Day separates surfaces with a frame and air shadow. Cloud Night - difference in brightness, thin frame and very soft internal backlight.

```css
html[data-theme="dark"] .surface {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .025),
    var(--shadow-sm);
}
```

The shadow creates depth, but not the effect of floating tiles. The darker the theme, the more important the frame and surface difference are, not the size of the shadow.

---

## 8. First screen

### 8.1. Basic structure

The first screen consists of two semantic zones:

1. **Meaning** - headline, lead, CTA, short proof.
2. **Work Scene** - a diagram of a process, interface, result or person in a work context.

Recommended mesh:

```css
.hero-copy {
  grid-column: span 5;
}

.hero-scene {
  grid-column: span 7;
}
```

On a narrow desktop `6 / 6` is allowed.

### 8.2. Semantic column

Order:

1. short category label;
2. H1;
3. lead;
4. primary and secondary CTA;
5. one trust line: term, format, result or fact.

No need to add a separate text block for each benefit.

### 8.3. Working scene

```css
.hero-scene {
  position: relative;
  min-height: 560px;
  padding: clamp(24px, 3vw, 40px);
  border: 1px solid var(--border);
  border-radius: 32px;
  color: var(--text-primary);
  background: var(--hero-atmosphere);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}
```

Cloud Night adds a subtle internal light:

```css
html[data-theme="dark"] .hero-scene {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .035),
    var(--shadow-md);
}
```

There should be one of three things inside:

- visual process route;
- interface with real statuses;
- photograph of a person with one information layer.

### 8.4. Theme behavior

| Element | Cloud Day | Cloud Night |
|---|---|---|
| Stage background | white with blue and lavender depth | translucent night blue with muted light |
| Main text | `text-primary` | `text-primary`, without pure white and glow |
| CTA | dark gradient, white text | light gradient, dark text |
| Secondary button | white surface | blue graphite surface |
| Route | thin gray-blue line | muted blue line, the active area is lighter |
| Warm accent | small gold detail | local warm light or mark |

### 8.5. hero options

**Option A - product or service**

Right: 3–5 process nodes connected by a route. One node is active, one shows the result.

**Option B - case**

Right: a calm human photograph, with one result card and one short metric on top.

**Option C - document or commercial proposal**

Right: structural card of the scope of work, deadline and result without a decorative scene.

**Option D - theme as part of the product**

A compact Cloud Day/Cloud Night switch is allowed in the header. It shouldn't compete with the main CTA.

### 8.6. Limitations of hero

- no more than two CTAs;
- no more than one primary metric;
- no more than five nodes in the circuit;
- no more than three colored surfaces;
- without carousel;
- without background video;
- without infinitely floating cards;
- without text over complex image;
- without neon lighting for each card;
- without splitting the screen exactly in half into a light and dark theme, if the screen does not show a comparison of themes.

---

## 9. Surfaces and cards

### 9.1. Basic card

```css
.card {
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
  background: var(--surface-1);
  box-shadow: var(--shadow-sm);
}
```

The same CSS works in both themes.

### 9.2. Types of cards

| Type | Purpose | Semantic background |
|---|---|---|
| `plain` | main content | `surface-1` |
| `soft` | secondary information | `surface-2` |
| `selected` | selected area | `surface-3` |
| `sky` | active process or action | `accent-primary-soft` |
| `lavender` | analysis, AI, research | `accent-secondary-soft` |
| `mint` | result, readiness, success | `success-soft` |
| `sun` | attention or human detail | `warning-soft` |
| `danger` | error or blocking condition | `danger-soft` |

In Cloud Night, colored cards remain dark. You cannot use light pastel backgrounds from Cloud Day in them.

### 9.3. Card structure

Recommended order:

1. icon or label;
2. title;
3. up to four lines of text;
4. status, metric or action.

The card must answer one question.

### 9.4. Nesting

A maximum of two levels are allowed:

```text
секция
└── основная поверхность
    └── локальный элемент или строка
```

Card within a card within a card is prohibited.

### 9.5. Hover

```css
.card[data-clickable="true"] {
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease;
}

.card[data-clickable="true"]:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
  box-shadow: var(--shadow-md);
}
```

The card does not bounce, is not scaled and does not receive an external glow.

### 9.6. Surface separation in Cloud Night

In a dark theme, adjacent levels must differ in at least two characteristics:

- background brightness;
- frame;
- shadow or inner line;
- color shade density.

Transparency alone is not enough.

---

## 10. Buttons, links and fields

### 10.1. Main button

```css
.button-primary {
  min-height: 50px;
  padding: 0 20px;
  border: 0;
  border-radius: 14px;
  color: var(--button-primary-text);
  background: var(--button-primary-bg);
  box-shadow: var(--shadow-sm);
  font-size: 15px;
  font-weight: 650;
  transition:
    background 180ms ease,
    box-shadow 180ms ease;
}

.button-primary:hover {
  background: var(--button-primary-bg-hover);
  box-shadow: var(--shadow-md);
}

.button-primary:active {
  box-shadow: var(--shadow-sm);
}
```

- Cloud Day: thicker blue-violet gradient and white text;
- Cloud Night: light sky-lavender gradient and dark text;
- the button does not rise or increase;
- external glow is not used.

### 10.2. Secondary button

```css
.button-secondary {
  min-height: 50px;
  padding: 0 20px;
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text-primary);
  background: var(--surface-1);
  box-shadow: var(--shadow-sm);
}

.button-secondary:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
}
```

### 10.3. Text link

```css
.text-link {
  color: var(--accent-primary-strong);
}
```

- underlining appears on hover or persists permanently in long text;
- nearby arrow is allowed;
- the link should not look like a third type of button;
- link color is checked separately on each topic.

### 10.4. CTA texts

Preferred wording:

- `Обсудить задачу`;
- `Посмотреть подход`;
- `Открыть кейс`;
- `Показать процесс`;
- `Получить план запуска`;
- `Перейти к следующему шагу`.

Avoid:

- `Узнать больше` without context;
- `Попробовать магию`;
- `Запустить будущее`;
- promises of instant results;
- caps and exclamation marks.

### 10.5. Fields

```css
.input {
  min-height: 50px;
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text-primary);
  background: var(--surface-1);
}

.input::placeholder {
  color: var(--text-muted);
}

.input:focus-visible {
  border-color: var(--accent-primary);
  outline: none;
  box-shadow: 0 0 0 4px var(--focus-ring);
}
```

Placeholder should not be the only label for the field.

### 10.6. Disabled and loading

- disabled state reduces contrast but remains readable;
- opacity of the entire component does not fall below `0.55`;
- loading does not change the width of the button;
- spinner inherits the button text color;
- the state is not indicated only by a decrease in brightness.

---

## 11. Processes, routes and UI panels

Process graphics are a key signature element of Cloudline. Its logic is the same in both topics.

### 11.1. Nodes

The node contains:

- short name;
- state;
- , if necessary, a responsible role;
- one next transition.

```css
.flow-node {
  min-width: 180px;
  max-width: 280px;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: 18px;
  color: var(--text-primary);
  background: var(--surface-1);
  box-shadow: var(--shadow-sm);
}
```

### 11.2. Lines

```css
.route-default  { stroke: var(--border-strong); }
.route-active   { stroke: var(--accent-primary); }
.route-complete { stroke: var(--success); }
.route-error    { stroke: var(--danger); }
```

Rules:

- normal communication: `1.5px`;
- active and completed: `2px`;
- dotted line is used only for conditional or future transition;
- hand is small and functional;
- the line should not go through the text;
- In Cloud Night, only the active short section is lit, and not the entire route.

### 11.3. Node states

| State | Background | Frame | Text |
|---|---|---|---|
| Regular | `surface-1` | `border` | `text-primary` |
| Selected | `surface-3` | `border-strong` | `text-primary` |
| Active | `accent-primary-soft` | `border-strong` | `accent-primary-strong` |
| Analysis | `accent-secondary-soft` | `accent-secondary` | `accent-secondary` |
| Done | `success-soft` | `success` | `success` |
| Attention | `warning-soft` | `warning` | `warning` |
| Error | `danger-soft` | `danger` | `danger` |

Status text remains required.

### 11.4. Panels

The UI panel should show the real meaning:

- project status;
- next step;
- input data;
- reaction rule;
- automation result;
- readiness criterion;
- short metric;
- log of recent events.

The panel is not used as an empty decorative rectangle.

### 11.5. Tables

```css
.table-wrap {
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--surface-1);
}

th {
  color: var(--text-secondary);
  background: var(--surface-2);
  font-size: 13px;
  font-weight: 650;
}

td,
th {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  text-align: left;
}
```

Rules:

- without heavy zebra;
- an important column can be highlighted `surface-3`;
- numbers are aligned to the right;
- statuses are displayed in text and color;
- in Cloud Night, lines are not separated by black bars;
- on mobile the table scrolls or turns into a list of cards.

### 11.6. Charts

- background graphic: `surface-1`;
- mesh: `border` with reduced opacity;
- main row: `accent-primary`;
- comparative series: `accent-secondary`;
- positive: `success`;
- warning: `warning`;
- axis labels: `text-muted`;
- the same color means the same row in both themes.

---

## 12. Images

### 12.1. Main principle

The images show **people who have found it easier to work**.

Formula:

```text
реальный человек
+ понятный рабочий контекст
+ естественный или мягкий направленный свет
+ ощущение спокойной собранности
```

### 12.2. Suitable Scenes

- man at the window with a laptop;
- small team at the board;
- specialist checks the result on the screen;
- calm conversation with the client;
- work in a studio, office, library or cafe;
- moment of transfer, discussion or recording of the result;
- workspace with air and natural details.

### 12.3. Mood

- natural facial expressions;
- confidence without staged victory;
- a calm smile is acceptable;
- a person is busy with real action;
- the frame does not look like a bank advertisement or a photo stock about synergy;
- There is space around a person.

### 12.4. Cloud Day Processing

```css
html[data-theme="light"] img[data-brand-image] {
  filter:
    saturate(.90)
    contrast(.96)
    brightness(1.04);
}
```

Soft blue or lavender overlay with opacity `0.06–0.14` is allowed.

### 12.5. Cloud Night Processing

```css
html[data-theme="dark"] img[data-brand-image] {
  filter:
    saturate(.82)
    contrast(1.03)
    brightness(.88);
}
```

A blue-graphite gradient with opacity `0.16–0.34` is allowed on top of the photo. Faces, hands and important work parts should not be lost in the shadows.

For the key hero, it is better to prepare a separate cropping or separate processing for each theme, rather than relying only on a CSS filter.

### 12.6. Cropping

- the face and hands are not cut off accidentally;
- the main object is not pressed to the edge;
- a safe zone remains on top of the image for one short signature;
- frame radius: `24–32px`;
- the horizon is not blocked without artistic reason;
- dark version is tested on a regular monitor, not just an HDR monitor.

### 12.7. Do not use

- robots and androids;
- holographic faces;
- cyberspace blue;
- of a man pointing at empty air;
- overly happy team around the laptop;
- sterile white office without details;
- dark sci-fi and neon server rooms;
- literal clouds as a constant background of photographs;
- artificial objects in human hands;
- automatically inverts photos when changing the theme.

---

## 13. Illustrations, icons and logo

### 13.1. Illustrations

Basic forms:

- translucent soft areas;
- thin route lines;
- nodes and points;
- layers that converge into one system;
- simple diagrams;
- abstract horizon or light flow.

Style:

- 2D;
- soft depth;
- limited palette;
- minimum parts;
- without glossy 3D;
- without cartoon characters;
- without a literal image of an AI brain.

In Cloud Night, the illustration should not turn into a neon outline. The bulk remains dark, only the semantic points are highlighted with light.

### 13.2. Icons

- line icons;
- line thickness: `1.75–2px`;
- rounded ends;
- size in interface: `18–22px`;
- card size: `22–28px`;
- icon container: `40–48px`;
- one set and single optics on the entire carrier;
- base color: `text-secondary`;
- active color: `accent-primary`;
- container background: `surface-2` or a themed soft token.

The icon helps to recognize the function, but does not replace the signature.

### 13.3. Logo

The logo is used as an independent sign. There is no need to write `Isty` next to it again if it is already part of the logo.

Recommended colors:

| Context | Color |
|---|---|
| Cloud Day, neutral | `text-primary` |
| Cloud Day, accent | `accent-primary-strong` |
| Cloud Night, neutral | `text-primary` |
| Cloud Night, accent | `accent-primary` or soft sky/lavender gradient |
| On main CTA | `button-primary-text` |

In the header, the logo should not compete with the CTA. In Cloud Night, the external glow around the logo is not used; Only a small shadow on the colored container of the sign is acceptable.

### 13.4. Theme toggle

Topic switch:

- uses clear sun and moon icons along with `aria-label`;
- has an interactive area no smaller than `44 × 44px`;
- shows the current status;
- doesn't look like a main CTA;
- saves user selection;
- does not change navigation position when switching.

---

## 14. Animation

General character: **calm confirmation of the action**.

### 14.1. Tokens

```css
:root {
  --duration-fast: 160ms;
  --duration-base: 240ms;
  --duration-slow: 420ms;
  --ease-standard: cubic-bezier(.22, 1, .36, 1);
}
```

### 14.2. Allowed movements

- fade + shift to `8px` when appearing;
- smooth filling of the route;
- changing the frame and background of the active node;
- status appearance;
- soft change of number;
- accordion opening;
- short movement of the arrow to `3px`;
- one slow cloud gradient shift when loading.

### 14.3. Limitations

- without constant floating of cards;
- without parallax on long pages;
- without CTA scaling;
- without spring transitions;
- without sharp blur;
- without animation of each decorative element;
- no more than two simultaneously moving semantic objects;
- `prefers-reduced-motion` is required.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: .01ms !important;
  }
}
```

---

## 15. Text and tone

Tone Isty:

- calm;
- engineering;
- human;
- clear;
- confident;
- without ostentatious manufacturability;
- without pressure;
- with respect for the client's reality.

### 15.1. Basic text formula

```text
что происходит
→ что Isty собирает
→ что увидит команда
→ какой следующий шаг
```

### 15.2. Preferred wording

- `Собираем процесс, который команда понимает и может развивать.`
- `Показываем роли, события и правила реакции в одной рабочей системе.`
- `Следующий шаг виден команде и фиксируется в процессе.`
- `Передаём решение вместе с документацией и понятным контуром поддержки.`
- `Автоматизация берёт рутину, а решения остаются у команды.`

### 15.3. Semantic verbs

- assemble;
- show;
- link;
- transmit;
- develop;
- connect;
- commit;
- see;
- run;
- describe;
- check;
- simplify;
- forward.

### 15.4. What to Avoid

- dictionary of hype around AI;
- statements about revolution;
- artificially sharp oppositions;
- over-promising;
- office supplies;
- long introductory structures;
- abstractions without result;
- words `магия`, `будущее уже здесь`, `взрывной рост`;
- series of exclamation marks;
- decorative English terminology where there is a clear Russian word.

---

## 16. Application by media

### 16.1. Landing

Landing page can be completely light or completely dark.

Section order:

1. clear promise and working scene;
2. problem or context;
3. process diagram;
4. what is included in the working circuit;
5. case or evidence;
6. launch format;
7. transmission and support;
8. next step.

Topic rules:

- choose one main theme before starting design;
- use the opposite topic in a maximum of one or two semantic sections;
- do not change the theme after each screen;
- custom switch is valid as long as both versions are fully tested;
- Cloud Night can occupy the entire landing page if readability and calm depth are maintained.

### 16.2. Presentations

Both topics are equal.

**Cloud Day:**

- detailed diagrams;
- tables;
- financial blocks;
- long explanations;
- printing materials.

**Cloud Night:**

- covers;
- key takeaways;
- demo slides;
- performances in a dark room;
- a whole presentation with a small amount of text.

General rules:

- one output per slide;
- header up to two lines;
- one main visual object;
- do not use a decorative gradient on each slide;
- in a mixed presentation Cloud Day is responsible for details, Cloud Night is responsible for accent transitions;
- the topic does not change without a semantic reason.

### 16.3. Documents and commercial offers

Cloud Day is the preferred mode for main content due to typing and lengthy reading.

Acceptable:

- dark cover;
- dark separator;
- dark one-page digital version;
- full Cloud Night for a document that does not print and contains short blocks.

General rules:

- line width up to `68ch`;
- tables use semantic tokens;
- decorative clouds only on the cover or divider;
- mint means a decision has been made or readiness;
- solar means a question or area of ​​attention;
- The meaning of the status is preserved between topics.

### 16.4. Internal interfaces

Priority:

1. state;
2. next step;
3. responsibility;
4. term;
5. history of events.

It is recommended to support both themes through the same semantic tokens.

- custom theme saved;
- system theme is used only as an initial value;
- graphs and statuses are checked in both topics;
- color is used for navigation and status, not decoration;
- You cannot release a “dark theme” in which only the page background is replaced.

### 16.5. Social networks

Both themes are suitable for the series.

- one abstract;
- one process or human visual;
- up to two accent colors;
- large header without caps;
- short signature;
- logo in the quiet zone;
- without a dozen small cards;
- light and dark posts can be alternated between posts, maintaining the same grid and typography.

### 16.6. Mixed media

When both topics are used in one material:

- Cloud Day and Cloud Night are separated by an entire section or slide;
- transition supports the meaning: introduction, climax, summary or transition to details;
- components do not change geometry;
- accent colors retain meaning;
- After switching, the theme lasts long enough to avoid visual flickering.

---

## 17. Adaptability

### 17.1. Desktop

- hero: `5 / 7` or `6 / 6`;
- working stage not lower than `520px`;
- sections use 12 columns;
- body text does not stretch to full width;
- large cards can be `2 × 2` or `3 × 1`.

### 17.2. Tablet

- hero usually becomes `4 / 4`;
- size H1 is reduced to `48–64px`;
- decorative clouds are shrinking;
- complex diagrams are simplified to a linear route;
- cards are rearranged into two columns.

### 17.3. Mobile

Hero order:

1. label;
2. H1;
3. lead;
4. main CTA;
5. secondary CTA or link;
6. working scene;
7. trust string.

Rules:

- H1: `40–50px`, `line-height: 1.05`;
- horizontal padding: `16px`;
- buttons can take up the entire width;
- cards are in one column;
- the diagram turns into a vertical route;
- decorative lines do not intersect text;
- tables scroll horizontally or turn into a list;
- hover is not the only way to show action;
- size of the interactive zone - not less than `44 × 44px`;
- in Cloud Night, the transparency of surfaces is increased so that the cards do not blend into the background;
- blur of background areas reduced by `20–35%` for performance;
- The theme switch remains available, but does not take the place of the main action.

---

## 18. Availability

Mandatory requirements for both topics:

- contrast of regular text is not lower than `4.5:1`;
- contrast of large text is not lower than `3:1`;
- the size of the main text is not less than `16px`;
- visible `focus-visible`;
- status is not conveyed only by color;
- controls have clear labels;
- images have meaningful `alt`;
- decorative images have a blank `alt`;
- the logical order of focus coincides with the visual one;
- touch-target not less than `44 × 44px`;
- form errors explain what to fix;
- animation takes into account `prefers-reduced-motion`;
- blur and transparency do not reduce readability;
- headers are used in the correct hierarchy.

### 18.1. Topic parity check

Each component is checked at least in the following states:

- default;
- hover;
- focus-visible;
- active;
- selected;
- disabled;
- loading;
- success;
- warning;
- error.

Verification matrix:

```text
компонент × состояние × Cloud Day × Cloud Night × desktop/mobile
```

### 18.2. Dark theme

- `color-scheme: dark` is specified explicitly;
- system fields and scrollbars should not remain blindingly light;
- main background is not pure black;
- white text is replaced with soft cold `text-primary`;
- glow is not used as the only focus indicator;
- images are not darkened until semantic details are lost;
- interface is tested on an SDR monitor and at reduced brightness.

### 18.3. Light theme

- white surfaces are separated from the background by a frame or shadow;
- secondary text does not become too light;
- pastel-on-pastel is not used for small text;
- field boundaries are visible without hover;
- background clouds do not pass under long paragraphs with high saturation.

---

## 19. Antipatterns

### 19.1. Too "cute cloud"

Signs:

- literal clouds everywhere;
- pastel without contrast;
- cartoon icons;
- rounding each element to pill;
- children's facial expressions of the characters.

Solution: return a strict grid, functional diagrams, contrasting text and limit decorative clouds to the background.

### 19.2. Typical SaaS

Signs:

- purple-blue gradient on each element;
- dozens of floating glass cards;
- abstract 3D-sphere;
- template headline about business growth;
- identical icon cards in each section.

Solution: show real Isty processes, use one main focus and build a composition around the result.

### 19.3. Fake dark theme

Signs:

- only the body background has been replaced;
- cards remained white or received random opacity;
- links, focus and statuses are not adapted;
- the images are simply darkened;
- system elements remain light;
- Contrast not checked.

Solution: Use a full set of semantic tokens and check each component in all states.

### 19.4. It's too hard a night

Signs:

- almost black background;
- huge dense shadows;
- white text hurts the eyes;
- neon around each button;
- cyberpunk, stars and cosmic dust;
- too much glass.

Solution: Bring back night blue, soft text, local highlight areas and sharp surfaces.

### 19.5. Too sterile day

Signs:

- completely white page;
- gray frames without depth;
- lack of human detail;
- feeling of the administrative panel.

Solution: Add one cloudy area, human image, or warm accent while maintaining clarity.

### 19.6. Too decorative

Signs:

- background is more active than text;
- lines do not show route;
- cards do not make sense;
- sky, lavender, mint, sun and danger are used simultaneously;
- the visual cannot be explained in one sentence.

Solution: Remove anything that doesn't help you understand the process, state, or next step.

### 19.7. Two different design systems

Signs:

- in the dark theme, other radii or sizes;
- component changes location;
- status color changes meaning;
- dark version looks like a separate brand;
- content has to be rewritten to fit the topic.

Solution: keep the same geometry and semantics; change only atmosphere and color tokens.

---

## 20. Migration from Retro Orbit Editorial

| Was | Became |
|---|---|
| dark graphite base and paper alternative | two equal themes Cloud Day and Cloud Night |
| large slanted caps | quiet header in normal case |
| poster center stage | working process scene |
| orbits and space | routes, connections and nodes |
| grain and printed texture | clean surfaces and soft depth |
| sharp rectangles | radii `16–32px` |
| violet + sage as main pair | sky as main, lavender/mint as support |
| strong visual impact | clarity, confidence and ease of reading |
| two visually separate modes | one component system based on semantic tokens |
| decorative UI panels | functional panels only |

When updating existing materials, the following changes first:

1. token architecture;
2. background and surfaces;
3. heading typography;
4. radii and depth;
5. palette;
6. hero-composition;
7. process graphics;
8. images;
9. animation.

Old orbital lines, grain and poster blocks are not automatically transferred to the new system.

### 20.1. Migration from a light Cloudline prototype

To add Cloud Night to an already assembled light interface:

1. replace raw colors with semantic tokens;
2. put hero and page gradients into variables;
3. add text, frames, shadows and surfaces to theme tokens;
4. replace white `rgba(...)` inside components with `surface-*`;
5. add separate primary CTA values ​​for Cloud Night;
6. check photos and graphics;
7. add `color-scheme`;
8. check all component states;
9. check that the wrong theme is not flashed when loading;
10. go through the accessibility matrix for both topics.

---

## 21. Quality checklist

### 21.1. General system

- [ ] H1 is easy to read and does not look aggressive.
- [ ] The main text has sufficient contrast.
- [ ] The text width does not exceed `68ch`.
- [ ] There is one main meaning on the screen.
- [ ] The working scene shows the actual process or result.
- [ ] CTA names a specific action.
- [ ] Cards have a function.
- [ ] No more than two levels of nesting.
- [ ] Use no more than two accent colors at a time.
- [ ] Cloudy areas do not interfere with reading.
- [ ] No literal cloud cliparts.
- [ ] There is no inclined caps and poster aggression.
- [ ] No excessive glassmorphism.
- [ ] No random floating cards.
- [ ] The status is clear without color.
- [ ] Focus states are visible.
- [ ] The mobile version preserves the order of meanings.
- [ ] The person understands what to do next.

### 21.2. Cloud Day

- [ ] Light surfaces are separated from the background.
- [ ] Secondary text is not too light.
- [ ] Pastel is not used for small text.
- [ ] White doesn't take up the entire page without depth.
- [ ] The blue and lavender background doesn't compete with the content.

### 21.3. Cloud Night

- [ ] The background is blue-graphite, not black.
- [ ] The main text is soft, without blinding white.
- [ ] Cards vary in surface level.
- [ ] No neon and sci-fi.
- [ ] Glow does not replace the frame and focus.
- [ ] Accent colors occupy a small area.
- [ ] Photos preserve faces and work details.
- [ ] System fields and controls are really dark.

### 21.4. Topic parity

- [ ] The components have the same geometry.
- [ ] The order of the content does not change.
- [ ] Statuses retain their meaning.
- [ ] All conditions have been verified in both topics.
- [ ] Graphs keep colors consistent with series.
- [ ] Switching does not cause a layout jump.
- [ ] There is no flash of the wrong theme when loading.

---

## 22. Short formula

**Isty Cloudline - a professional system about clear processes, calm automation and people who make it easier to work.**

Two atmospheres of one brand:

```text
Cloud Day   = воздух / дневной свет / чистые поверхности / спокойная ясность
Cloud Night = ночной синий / мягкое свечение / глубокие поверхности / собранный фокус
```

Common visual language:

```text
sky / lavender / mint / тёплая точка / мягкая поверхность /
маршрут / человек / следующий шаг / единая семантика тем
```
