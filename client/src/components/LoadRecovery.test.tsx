// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LoadRecovery } from "./LoadRecovery";
afterEach(cleanup);
it("cancels automatic preload recovery and keeps the manuscript mounted", () => {
  const unmount = vi.fn();
  function Draft() {
    React.useEffect(() => unmount, []);
    return <div>Rascunho preservado</div>;
  }
  render(
    <>
      <LoadRecovery />
      <Draft />
    </>
  );
  const error = new Event("vite:preloadError", { cancelable: true });
  fireEvent(window, error);
  expect(error.defaultPrevented).toBe(true);
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Continuar escrevendo" }));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Rascunho preservado")).toBeTruthy();
  expect(unmount).not.toHaveBeenCalled();
});
