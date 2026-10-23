// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cfg = vi.hoisted(() => ({ pathRouting: true }));
vi.mock("@/lib/config", () => ({ config: { useMock: true, apiBaseUrl: "", get pathRouting() { return cfg.pathRouting; } } }));

import { NavProvider, useNav } from "@/lib/nav";

let nav!: ReturnType<typeof useNav>;
function Probe() {
  nav = useNav();
  return <p data-testid="state">{nav.view}|{JSON.stringify(nav.params)}|{String(nav.canGoBack)}</p>;
}
const state = () => screen.getByTestId("state").textContent;
const mount = (url: string) => { window.history.replaceState(null, "", url); return render(<NavProvider><Probe /></NavProvider>); };

beforeEach(() => { cfg.pathRouting = true; });
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

describe("NavProvider mit Pfad-Routing", () => {
  it("liest Ansicht und Detail-ID aus der Adresse (Reload/Teilen)", () => {
    mount("/grows/g-7");
    expect(state()).toBe('grows|{"growId":"g-7"}|false');
  });

  it("unbekannter Pfad → 404-Ansicht, die Adresse bleibt stehen (kein stilles Umleiten)", () => {
    mount("/gibt-es-nicht");
    expect(state()).toBe("notFound|null|false");
    expect(window.location.pathname).toBe("/gibt-es-nicht");
  });

  it("von der 404-Ansicht zum Dashboard: neue Adresse „/“; ohne History führt back() zum Dashboard", () => {
    mount("/gibt-es-nicht");
    act(() => nav.back());
    expect(state()).toBe("dashboard|null|true");
    expect(window.location.pathname).toBe("/");
  });

  it("alter ?view=-Link wird zum Pfad, der Hash bleibt", () => {
    mount("/?view=social#post-9");
    expect(state()).toBe("social|null|false");
    expect(window.location.pathname + window.location.hash).toBe("/social#post-9");
    expect(window.location.search).toBe("");
  });

  it("navigate schreibt die URL, Zurück/Vorwärts stellen Ansichten wieder her", () => {
    mount("/");
    act(() => nav.navigate("grows"));
    act(() => nav.navigate("grows", { growId: "g1" }));
    expect(window.location.pathname).toBe("/grows/g1");
    expect(state()).toBe('grows|{"growId":"g1"}|true');
    act(() => { window.history.back(); });
    return vi.waitFor(() => {
      expect(state()).toBe("grows|null|true");
      expect(window.location.pathname).toBe("/grows");
    });
  });

  it("navigate auf die identische Ansicht legt keinen doppelten History-Eintrag an", () => {
    mount("/forum");
    const before = window.history.length;
    act(() => nav.navigate("forum"));
    expect(window.history.length).toBe(before);
  });

  it("nicht verlinkbare Ansichten (Erstellen) zeigen „/“, bleiben aber über Zurück erreichbar", () => {
    mount("/grows");
    act(() => nav.navigate("create", { kind: "grow" }));
    expect(window.location.pathname).toBe("/");
    expect(state()).toBe('create|{"kind":"grow"}|true');
  });

  it("back() ohne eigene History: Detail → Liste, Liste → Dashboard", () => {
    mount("/forum/t1");
    act(() => nav.back());
    expect(state()).toBe("forum|null|true");
    expect(window.location.pathname).toBe("/forum");
  });

  it("replaceParams ändert die URL ohne neuen Eintrag (Profil-Tab)", () => {
    mount("/profile");
    const before = window.history.length;
    act(() => nav.replaceParams({ tab: "settings" }));
    expect(window.location.pathname).toBe("/profile/settings");
    expect(window.history.length).toBe(before);
    expect(state()).toBe('profile|{"tab":"settings"}|false');
  });
});

describe("NavProvider im Legacy-Modus (ohne Pfad-Routing)", () => {
  it("lässt die Adresse unverändert und liest weiter ?view=", () => {
    cfg.pathRouting = false;
    mount("/?view=forum");
    expect(state()).toBe("forum|null|false");
    act(() => nav.navigate("grows"));
    expect(window.location.pathname + window.location.search).toBe("/?view=forum");
    expect(state()).toBe("grows|null|true");
  });
});
