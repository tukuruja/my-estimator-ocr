import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/NotFound';
import { Route, Switch } from 'wouter';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider } from './contexts/ThemeContext';
import Home from './pages/Home';
import EstimateReportPage from './pages/EstimateReportPage';
import ConsensusBlueprintPage from './pages/ConsensusBlueprintPage';
import {
  ConcretePriceTable,
  RoadPriceTable,
  SecondaryPriceTable,
  MachinesPriceTable,
  CutterPriceTable,
} from './pages/PriceTablePages';

function Router() {
  return (
    <Switch>
      <Route path={'/'}>
        <Home preferredBlockType="secondary_product" />
      </Route>
      <Route path={'/retaining-wall-input'}>
        <Home preferredBlockType="retaining_wall" />
      </Route>
      <Route path={'/pavement-input'}>
        <Home preferredBlockType="pavement" />
      </Route>
      <Route path={'/demolition-input'}>
        <Home preferredBlockType="demolition" />
      </Route>
      <Route path={'/estimates/secondary-product'}>
        <EstimateReportPage preferredBlockType="secondary_product" />
      </Route>
      <Route path={'/estimates/retaining-wall'}>
        <EstimateReportPage preferredBlockType="retaining_wall" />
      </Route>
      <Route path={'/estimates/pavement'}>
        <EstimateReportPage preferredBlockType="pavement" />
      </Route>
      <Route path={'/estimates/demolition'}>
        <EstimateReportPage preferredBlockType="demolition" />
      </Route>
      <Route path={'/print'}>
        <EstimateReportPage />
      </Route>
      <Route path={'/ai-consensus'}>
        <ConsensusBlueprintPage />
      </Route>
      <Route path={'/price-tables/concrete'} component={ConcretePriceTable} />
      <Route path={'/price-tables/road'} component={RoadPriceTable} />
      <Route path={'/price-tables/secondary'} component={SecondaryPriceTable} />
      <Route path={'/price-tables/machines'} component={MachinesPriceTable} />
      <Route path={'/price-tables/cutter'} component={CutterPriceTable} />
      <Route path={'/404'} component={NotFound} />
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
