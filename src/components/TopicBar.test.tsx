// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopicBar } from "./TopicBar";
import type { GroupTopic } from "@/services/interfaces";

const topic = (over: Partial<GroupTopic>): GroupTopic => ({ id: "t", name: "Allgemein", emoji: "", isDefault: false, private: false, adminsOnly: false, closed: false, pinned: false, canWrite: true, unread: 0, muted: false, ...over });

describe("TopicBar (B-65)", () => {
  afterEach(cleanup);

  it("zeigt Themen als Reiter mit Auswahl, Ungelesen-Zähler und Hinweisen", () => {
    const onSelect = vi.fn();
    render(<TopicBar activeId="a" onSelect={onSelect} topics={[
      topic({ id: "a", name: "Allgemein", isDefault: true }),
      topic({ id: "b", name: "Technik", emoji: "💡", unread: 4 }),
      topic({ id: "c", name: "Ankündigungen", canWrite: false, adminsOnly: true }),
      topic({ id: "d", name: "Stumm", unread: 9, muted: true }),
    ]} />);
    expect(screen.getByRole("tab", { name: /Allgemein/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /Technik/ }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByLabelText("4 ungelesen")).toBeTruthy();
    expect(screen.queryByLabelText("9 ungelesen")).toBeNull(); // stumm: keine Zahl
    expect(screen.getByLabelText("Schreiben gesperrt")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Technik/ }));
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("bietet „Themen verwalten“ nur, wenn onManage übergeben wird", () => {
    const onManage = vi.fn();
    const { rerender } = render(<TopicBar activeId="a" onSelect={() => undefined} topics={[topic({ id: "a" })]} />);
    expect(screen.queryByRole("button", { name: "Themen verwalten" })).toBeNull();
    rerender(<TopicBar activeId="a" onSelect={() => undefined} onManage={onManage} topics={[topic({ id: "a" })]} />);
    fireEvent.click(screen.getByRole("button", { name: "Themen verwalten" }));
    expect(onManage).toHaveBeenCalled();
  });
});
