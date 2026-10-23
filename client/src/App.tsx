import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router as WouterRouter, Switch, useRoute } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import EditorialPreview from "./pages/EditorialPreview";
import ReaderPage from "./pages/ReaderPage";
import XuriPassportVerify from "./pages/XuriPassportVerify";
import AuthorshipGuide from "./pages/AuthorshipGuide";
import { LoadRecovery } from "./components/LoadRecovery";
import { PwaPrompts } from "./components/PwaPrompts";
import { ContingencyGate } from "./components/ContingencyGate";
import { CONTINGENCY } from "./lib/contingency";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/ler/:token"} component={ReaderPage} />
      <Route path={"/preview/editorial"} component={EditorialPreview} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [isPassportVerifier] = useRoute("/verificar/xuri");
  const [isAuthorshipGuide] = useRoute("/autoria");
  // A verificação de um dossiê é local e pública; não exige login nem autenticação do espelho.
  if (isPassportVerifier) return <XuriPassportVerify />;
  if (isAuthorshipGuide) return <AuthorshipGuide />;
  return CONTINGENCY ? <ContingencyGate><Router /></ContingencyGate> : <Router />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <LoadRecovery />
          <PwaPrompts />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppContent />
          </WouterRouter>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
