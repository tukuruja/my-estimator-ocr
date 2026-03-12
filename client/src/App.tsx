import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import PlaceholderPage from "./pages/PlaceholderPage";
import {
  ConcretePriceTable,
  RoadPriceTable,
  SecondaryPriceTable,
  MachinesPriceTable,
  CutterPriceTable,
} from "./pages/PriceTablePages";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/retaining-wall-input"}>
        <PlaceholderPage title="擁壁の条件入力" />
      </Route>
      <Route path={"/pavement-input"}>
        <PlaceholderPage title="舗装の条件入力" />
      </Route>
      <Route path={"/demolition-input"}>
        <PlaceholderPage title="撤去工事の条件入力" />
      </Route>
      <Route path={"/estimates/secondary-product"}>
        <PlaceholderPage title="二次製品の見積書" />
      </Route>
      <Route path={"/estimates/retaining-wall"}>
        <PlaceholderPage title="擁壁の見積書" />
      </Route>
      <Route path={"/estimates/pavement"}>
        <PlaceholderPage title="舗装の見積書" />
      </Route>
      <Route path={"/estimates/demolition"}>
        <PlaceholderPage title="撤去工事の見積書" />
      </Route>
      <Route path={"/print"}>
        <PlaceholderPage title="印刷" />
      </Route>
      <Route path={"/price-tables/concrete"} component={ConcretePriceTable} />
      <Route path={"/price-tables/road"} component={RoadPriceTable} />
      <Route path={"/price-tables/secondary"} component={SecondaryPriceTable} />
      <Route path={"/price-tables/machines"} component={MachinesPriceTable} />
      <Route path={"/price-tables/cutter"} component={CutterPriceTable} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
