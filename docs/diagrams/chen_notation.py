"""Chen-notation EER for UniGrant, derived from schema/01_schema_er.sql.

Single rectangle  strong entity          Double rectangle  weak entity
Diamond           relationship           Double diamond    identifying relationship
Single line       partial participation  Double line       total participation (NOT NULL FK)
Oval              attribute of a relationship; dashed underline = partial key of a weak entity
"""
import sys
import math
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Polygon, Ellipse

OUT = sys.argv[1]
fig, ax = plt.subplots(figsize=(24, 22), dpi=150)
ax.set_xlim(-0.5, 27.5)
ax.set_ylim(-6.1, 24.2)
ax.set_aspect("equal")
ax.axis("off")
FONT = dict(family="DejaVu Serif")
LW = 1.6
GAP = 0.07  # half spacing of a double line

UNDER = []  # partial-key labels to underline once text is measured
ENT = {}   # name -> (x, y, w, h)
REL = {}   # name -> (x, y, w, h)


def entity(name, x, y, weak=False, w=None):
    w = w or max(2.6, 0.24 * len(name) + 1.0)
    h = 0.8
    ax.add_patch(Rectangle((x - w / 2, y - h / 2), w, h, fill=True, fc="white", ec="black", lw=LW, zorder=3))
    if weak:
        d = 0.13
        ax.add_patch(Rectangle((x - w / 2 + d, y - h / 2 + d), w - 2 * d, h - 2 * d, fill=False, ec="black", lw=LW, zorder=4))
    ax.text(x, y, name, ha="center", va="center", fontsize=17, fontweight="bold", zorder=5, **FONT)
    ENT[name] = (x, y, w, h)


def relation(name, x, y, ident=False, w=None, h=0.9, label=None):
    label = label or name
    w = w or max(2.2, 0.2 * max(len(s) for s in label.split("\n")) + 1.2)
    pts = [(x - w / 2, y), (x, y + h / 2), (x + w / 2, y), (x, y - h / 2)]
    ax.add_patch(Polygon(pts, closed=True, fc="#ececec", ec="black", lw=LW, zorder=3))
    if ident:
        s = 0.78
        inner = [(x - w / 2 * s, y), (x, y + h / 2 * s), (x + w / 2 * s, y), (x, y - h / 2 * s)]
        ax.add_patch(Polygon(inner, closed=True, fill=False, ec="black", lw=LW, zorder=4))
    ax.text(x, y, label, ha="center", va="center", fontsize=12.5, zorder=5, linespacing=1.0, **FONT)
    REL[name] = (x, y, w, h)


def edge_point(box, target, diamond=False):
    """Point where the segment from the box centre towards target leaves the shape."""
    x, y, w, h = box
    dx, dy = target[0] - x, target[1] - y
    if dx == 0 and dy == 0:
        return x, y
    if diamond:
        t = 1.0 / (abs(dx) / (w / 2) + abs(dy) / (h / 2))
    else:
        t = min((w / 2) / abs(dx) if dx else 1e9, (h / 2) / abs(dy) if dy else 1e9)
    return x + dx * t, y + dy * t


def seg(p, q, total=False):
    if total:
        dx, dy = q[0] - p[0], q[1] - p[1]
        n = math.hypot(dx, dy)
        ox, oy = -dy / n * GAP, dx / n * GAP
        for s in (1, -1):
            ax.plot([p[0] + s * ox, q[0] + s * ox], [p[1] + s * oy, q[1] + s * oy], color="black", lw=LW * 0.9, zorder=2, solid_capstyle="butt")
    else:
        ax.plot([p[0], q[0]], [p[1], q[1]], color="black", lw=LW, zorder=2)


def card(text, p, q, along=0.55, side=0.28):
    """Cardinality label near p on segment p->q, nudged off the line."""
    dx, dy = q[0] - p[0], q[1] - p[1]
    n = math.hypot(dx, dy)
    ux, uy = dx / n, dy / n
    x = p[0] + ux * along - uy * side
    y = p[1] + uy * along + ux * side
    ax.text(x, y, text, ha="center", va="center", fontsize=15, fontweight="bold", zorder=6,
            bbox=dict(fc="white", ec="none", pad=0.5), **FONT)


def link(ent, rel, c, total=False, via=None, ent_anchor=None, rel_anchor=None, side=0.28, role=None, along=0.55):
    """Entity -- relationship line with cardinality c at the entity end."""
    R = REL[rel]
    pts_mid = via or []
    first_target = pts_mid[0] if pts_mid else (R[0], R[1])
    p = ent_anchor or edge_point(ENT[ent], first_target)
    last_src = pts_mid[-1] if pts_mid else p
    q = rel_anchor or edge_point(R, last_src, diamond=True)
    chain = [p] + pts_mid + [q]
    for a, b in zip(chain, chain[1:]):
        seg(a, b, total)
    card(c, chain[0], chain[1], along=along, side=side)
    if role:
        a, b = chain[-2], chain[-1]
        mx, my = a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55
        ax.text(mx, my, role, ha="center", va="center", fontsize=12, style="italic", zorder=6,
                bbox=dict(fc="white", ec="none", pad=0.4), **FONT)


def attr(text, x, y, owner, partial_key=False, w=None):
    w = w or 0.17 * len(text) + 0.9
    h = 0.62
    ax.add_patch(Ellipse((x, y), w, h, fc="white", ec="black", lw=LW * 0.8, zorder=3))
    t = ax.text(x, y, text, ha="center", va="center", fontsize=11.5, zorder=5, **FONT)
    if partial_key:
        UNDER.append((t, y))
    box = (ENT.get(owner) or REL.get(owner))
    is_rel = owner in REL
    p = edge_point(box, (x, y), diamond=is_rel)
    # ellipse boundary towards owner
    dx, dy = p[0] - x, p[1] - y
    n = math.hypot(dx / (w / 2), dy / (h / 2))
    q = (x + dx / n, y + dy / n)
    ax.plot([p[0], q[0]], [p[1], q[1]], color="black", lw=LW * 0.8, zorder=2)


# ── Entities ─────────────────────────────────────────────────────
entity("FundingAgency", 3.4, 22.6)
entity("ExternalCall", 11.0, 22.6)
entity("Dependent", 2.6, 18.6, weak=True)
entity("Notification", 2.6, 14.4)
entity("User", 11.0, 15.0, w=3.0)
entity("Proposal", 20.5, 15.0)
entity("Grant_", 20.5, 9.2)
entity("Department", 2.6, 6.6)
entity("Project", 11.5, 4.6, w=3.0)
entity("Milestone", 23.8, 6.0)
entity("ResearchOutput", 23.4, 2.0)
entity("BudgetHead", 3.0, -1.4)
entity("Expense", 11.5, -1.4, w=3.0)
entity("Equipment", 20.5, -1.4, weak=True)

# ── Relationships ────────────────────────────────────────────────
relation("issues", 7.2, 22.6)
relation("MATCHES", 11.0, 19.2)
relation("has", 6.6, 17.4, ident=True)
relation("receives", 6.6, 14.6)
relation("SUPERVISES", 16.4, 12.2, w=3.0)
relation("submits", 15.8, 15.0)
relation("becomes", 20.5, 12.1)
relation("PUBLICATION_AUTHOR", 17.6, 19.6, w=4.0, h=1.15, label="PUBLICATION_\nAUTHOR")
relation("employs", 5.2, 10.4)
relation("leads", 8.6, 9.4)
relation("WORKS_ON", 12.6, 9.4, w=2.9)
relation("hosts", 6.6, 5.6)
relation("funds", 17.4, 7.2)
relation("tracks", 18.0, 5.1, ident=False)
relation("produces", 18.0, 2.2)
relation("allocates", 6.4, 1.8)
relation("incurs", 11.5, 1.6)
relation("charged to", 7.2, -1.4, w=2.7)
relation("buys", 16.2, -1.4, ident=True)
relation("approves", 6.6, -3.9)

# ── Links: (entity, relationship, cardinality, total participation) ─
link("FundingAgency", "issues", "1")
link("ExternalCall", "issues", "N", total=True)
link("ExternalCall", "MATCHES", "M", side=-0.3)
link("User", "MATCHES", "N", side=-0.3)
link("User", "has", "1", ent_anchor=(10.2, 15.4), side=-0.3)
link("Dependent", "has", "N", total=True)
link("User", "receives", "1", ent_anchor=(9.5, 14.75))
link("Notification", "receives", "N", total=True)
link("User", "submits", "1")
link("Proposal", "submits", "N", total=True)
link("Proposal", "becomes", "1")
link("Grant_", "becomes", "1")
link("User", "PUBLICATION_AUTHOR", "M", ent_anchor=(12.2, 15.4))
link("ResearchOutput", "PUBLICATION_AUTHOR", "N", via=[(26.8, 2.0), (26.8, 19.6)],
     ent_anchor=(25.1, 2.0), side=-0.3)
link("User", "SUPERVISES", "M", ent_anchor=(12.1, 14.6), role="supervisor", along=0.6, side=-0.3)
link("User", "SUPERVISES", "N", ent_anchor=(12.5, 14.75), via=[(16.4, 13.9)], role="supervisee", along=1.5, side=0.3)
link("Department", "employs", "1")
link("User", "employs", "N", ent_anchor=(10.0, 14.6))
link("User", "leads", "1", ent_anchor=(10.5, 14.6))
link("Project", "leads", "N", total=True, ent_anchor=(10.8, 5.0))
link("User", "WORKS_ON", "M", ent_anchor=(11.4, 14.6), side=-0.3)
link("Project", "WORKS_ON", "N", ent_anchor=(11.9, 5.0), side=-0.3)
link("Department", "hosts", "1")
link("Project", "hosts", "N")
link("Grant_", "funds", "1")
link("Project", "funds", "N", ent_anchor=(12.8, 5.0), side=0.3, along=1.2)
link("Project", "tracks", "1", ent_anchor=(13.0, 4.75), side=0.3)
link("Milestone", "tracks", "N", total=True)
link("Project", "produces", "1", ent_anchor=(13.0, 4.35), side=-0.3)
link("ResearchOutput", "produces", "N", total=True)
link("Project", "allocates", "1", ent_anchor=(10.4, 4.2))
link("BudgetHead", "allocates", "N", total=True)
link("Project", "incurs", "1")
link("Expense", "incurs", "N", total=True)
link("BudgetHead", "charged to", "1")
link("Expense", "charged to", "N", total=True)
link("Expense", "buys", "1")
link("Equipment", "buys", "N", total=True)
link("Expense", "approves", "N", ent_anchor=(10.6, -1.8))
link("User", "approves", "1", ent_anchor=(9.5, 15.25), via=[(0.0, 15.25), (0.0, -3.9)], side=-0.3, along=1.4)

# ── Partial keys of weak entities, attributes of M:N relationships ─
attr("dependent_name", 2.6, 20.0, "Dependent", partial_key=True)
attr("equipment_id", 24.4, -1.4, "Equipment", partial_key=True)
attr("match_score", 14.0, 20.2, "MATCHES")
attr("match_reason", 14.1, 19.05, "MATCHES")
attr("author_position", 21.6, 21.0, "PUBLICATION_AUTHOR")
attr("contribution", 21.6, 18.3, "PUBLICATION_AUTHOR")
attr("relationship_type", 18.2, 11.0, "SUPERVISES")
attr("start_date", 14.5, 11.25, "SUPERVISES")
attr("role_in_project", 15.4, 10.05, "WORKS_ON")
attr("hours_per_week", 15.9, 9.1, "WORKS_ON")
attr("stipend_amount", 15.3, 8.15, "WORKS_ON")

# ── Legend ───────────────────────────────────────────────────────
lx, ly = 0.0, -5.9
ax.text(lx, ly,
        "Double rectangle: weak entity (key includes the owner's key).  Double diamond: identifying relationship.  "
        "Double line: total participation (NOT NULL FK).\n"
        "1 / N / M: cardinality at that end.  Ovals: attributes stored on M:N relationship tables; dashed underline: partial key.  "
        "User specialisation (ISA on role) is drawn separately.",
        fontsize=12.5, va="bottom", ha="left", **FONT)

fig.canvas.draw()
inv = ax.transData.inverted()
for t, y in UNDER:
    bb = t.get_window_extent().transformed(inv)
    ax.plot([bb.x0, bb.x1], [y - 0.2, y - 0.2], color="black", lw=1.1, ls=(0, (3, 2)), zorder=5)

plt.savefig(OUT, bbox_inches="tight", pad_inches=0.25, facecolor="white")
print("saved", OUT)
