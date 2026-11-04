import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { createVantage } from "@vantage-ui/client";
import { VantageProvider } from "@vantage-ui/client/react";
import { schema, type Schema } from "./vantage.gen";
import { ConnectionGate } from "./ConnectionGate";
import { Shell } from "./Shell";
import { ToastHost } from "./ui";
import { Launchpad } from "./pages/Launchpad";
import { SalesOrders } from "./pages/SalesOrders";
import { SalesOrder } from "./pages/SalesOrder";
import { Customers } from "./pages/Customers";
import { Pipeline } from "./pages/Pipeline";
import { Receivables } from "./pages/Receivables";
import { Inbox } from "./pages/Inbox";
import { Deliveries, PaymentRun, Suppliers } from "./pages/Purchasing";
import { Inventory } from "./pages/Inventory";
import { Production } from "./pages/Production";
import { Journal, Statements } from "./pages/Finance";
import { People } from "./pages/People";
import "./styles.css";

const db = createVantage<Schema>({ schema });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VantageProvider db={db} fallback={<ConnectionGate />}>
      <ConnectionGate>
        <ToastHost>
          <BrowserRouter>
            <Routes>
              <Route element={<Shell />}>
                <Route path="/" element={<Launchpad />} />
                <Route path="/sales" element={<SalesOrders />} />
                <Route path="/sales/orders/:id" element={<SalesOrder />} />
                <Route path="/sales/customers" element={<Customers />} />
                <Route path="/sales/customers/:id" element={<Customers />} />
                <Route path="/sales/pipeline" element={<Pipeline />} />
                <Route path="/sales/receivables" element={<Receivables />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/purchasing" element={<Deliveries />} />
                <Route path="/purchasing/payments" element={<PaymentRun />} />
                <Route path="/purchasing/suppliers" element={<Suppliers />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/production" element={<Production />} />
                <Route path="/finance" element={<Statements />} />
                <Route path="/finance/journal" element={<Journal />} />
                <Route path="/people" element={<People />} />
                <Route path="*" element={<main className="page"><p className="muted">Page not found. <a href="/">Back to the launchpad</a></p></main>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastHost>
      </ConnectionGate>
    </VantageProvider>
  </StrictMode>,
);
