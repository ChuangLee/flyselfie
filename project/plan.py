#!/usr/bin/env python3
"""FlySkiSelfie project plan tool.

project/plan.json is the single source of truth. PROJECT_PLAN.md and
project/plan.csv are generated views; never edit them by hand.

Usage:
  python3 project/plan.py read [TASK-ID]
  python3 project/plan.py start TASK-ID --actor ROLE --note "current action"
  python3 project/plan.py update TASK-ID --actor ROLE [--status S] [--evidence PATH ...]
                                  [--next TEXT] [--note TEXT]
  python3 project/plan.py add TASK-ID --title T --owner ROLE [--depends ID ...] [--note TEXT]
  python3 project/plan.py render
"""
import argparse
import csv
import datetime as dt
import fcntl
import json
import os
import sys
from contextlib import contextmanager

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN_JSON = os.path.join(ROOT, "project", "plan.json")
PLAN_CSV = os.path.join(ROOT, "project", "plan.csv")
PLAN_MD = os.path.join(ROOT, "PROJECT_PLAN.md")
LOCK = os.path.join(ROOT, "project", ".plan.lock")

# not_run: a physical test that has not been executed; never replace with a pass.
STATUSES = ["todo", "in_progress", "done", "held", "blocked", "failed", "not_run", "gate_closed", "gate_passed"]


def now():
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


@contextmanager
def locked():
    with open(LOCK, "w") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def load():
    with open(PLAN_JSON, encoding="utf-8") as fh:
        return json.load(fh)


def save(plan):
    plan["meta"]["updated"] = now()
    tmp = PLAN_JSON + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(plan, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    os.replace(tmp, PLAN_JSON)
    render(plan)


def find(plan, task_id):
    for t in plan["tasks"]:
        if t["id"] == task_id:
            return t
    sys.exit(f"unknown task {task_id}; register it first with `add`")


def render(plan):
    with open(PLAN_CSV, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "title", "owner", "status", "depends", "evidence", "next"])
        for t in plan["tasks"]:
            w.writerow([t["id"], t["title"], t["owner"], t["status"], ";".join(t.get("depends", [])),
                        ";".join(t.get("evidence", [])), t.get("next", "")])
    lines = [
        f"# {plan['meta']['project']} 项目计划 / Project Plan",
        "",
        "> 生成视图，请勿手工编辑。数据源：`project/plan.json`；更新：`python3 project/plan.py`。",
        "> Generated view. Do not edit by hand. Source of truth: `project/plan.json`.",
        "",
        f"Updated: {plan['meta']['updated']}",
        "",
        "| ID | Title | Owner | Status | Depends | Next |",
        "|---|---|---|---|---|---|",
    ]
    for t in plan["tasks"]:
        lines.append(f"| {t['id']} | {t['title']} | {t['owner']} | `{t['status']}` | "
                     f"{', '.join(t.get('depends', []))} | {t.get('next', '')} |")
    lines += ["", "## Evidence and recent log", ""]
    for t in plan["tasks"]:
        lines.append(f"### {t['id']} — {t['title']}")
        lines.append("")
        if t.get("evidence"):
            lines.append("Evidence: " + ", ".join(f"`{e}`" for e in t["evidence"]))
            lines.append("")
        for entry in t.get("log", [])[-5:]:
            lines.append(f"- {entry['ts']} [{entry['actor']}] {entry['action']}: {entry['note']}")
        lines.append("")
    with open(PLAN_MD, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def log(task, actor, action, note):
    task.setdefault("log", []).append({"ts": now(), "actor": actor, "action": action, "note": note or ""})


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("read")
    r.add_argument("task", nargs="?")
    s = sub.add_parser("start")
    s.add_argument("task")
    s.add_argument("--actor", required=True)
    s.add_argument("--note", required=True)
    u = sub.add_parser("update")
    u.add_argument("task")
    u.add_argument("--actor", required=True)
    u.add_argument("--status", choices=STATUSES)
    u.add_argument("--evidence", nargs="*", default=[])
    u.add_argument("--next")
    u.add_argument("--note")
    a = sub.add_parser("add")
    a.add_argument("task")
    a.add_argument("--title", required=True)
    a.add_argument("--owner", required=True)
    a.add_argument("--depends", nargs="*", default=[])
    a.add_argument("--note")
    sub.add_parser("render")
    args = p.parse_args()

    if args.cmd == "read":
        if args.task:
            print(json.dumps(find(load(), args.task), ensure_ascii=False, indent=2))
        else:
            with open(PLAN_MD, encoding="utf-8") as fh:
                print(fh.read())
        return

    with locked():
        plan = load()
        if args.cmd == "render":
            render(plan)
            return
        if args.cmd == "add":
            if any(t["id"] == args.task for t in plan["tasks"]):
                sys.exit(f"{args.task} already exists")
            task = {"id": args.task, "title": args.title, "owner": args.owner, "status": "todo",
                    "depends": args.depends, "evidence": [], "next": "", "log": []}
            log(task, args.owner, "add", args.note)
            plan["tasks"].append(task)
        elif args.cmd == "start":
            task = find(plan, args.task)
            if task["status"] in ("todo", "held", "blocked"):
                task["status"] = "in_progress"
            log(task, args.actor, "start", args.note)
        elif args.cmd == "update":
            task = find(plan, args.task)
            if args.status == "done" and not (task.get("evidence") or args.evidence):
                sys.exit("cannot mark done without readable evidence (--evidence PATH)")
            for e in args.evidence:
                if not os.path.exists(os.path.join(ROOT, e)):
                    sys.exit(f"evidence path not found: {e}")
                if e not in task["evidence"]:
                    task["evidence"].append(e)
            if args.status:
                task["status"] = args.status
            if args.next is not None:
                task["next"] = args.next
            log(task, args.actor, "update" + (f"->{args.status}" if args.status else ""), args.note)
        save(plan)


if __name__ == "__main__":
    main()
