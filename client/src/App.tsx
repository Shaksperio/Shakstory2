import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router as WouterRouter, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import EditorialPreview from "./pages/EditorialPreview";
import ReaderPage from "./pages/ReaderPage";
import { LoadRecovery } from "./components/LoadRecovery";
import { PwaPrompts } from "./components/PwaPrompts";
import { ContingencyGate } from "./components/ContingencyGate";
import { CONTINGENCY } from "./lib/contingency";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/ler/:token"} component={ReaderPage} />
      <Route path={"/preview/editorial"} component={EditorialPreview} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <LoadRecovery />
          <PwaPrompts />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            {CONTINGENCY ? <ContingencyGate><Router /></ContingencyGate> : <Router />}
          </WouterRouter>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
