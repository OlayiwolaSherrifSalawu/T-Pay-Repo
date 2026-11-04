import { Router } from 'express';
import { InventoryController } from '../controllers/inventory.controller';
import { BudgetController } from '../controllers/budget.controller';
import { TransitController, AssistantController } from '../controllers/transit.controller';

export const apiRouter = Router();

// Merchant Inventory & Voice Sales (Case 1)
apiRouter.get('/inventory', InventoryController.getInventory);
apiRouter.post('/inventory/voice-sale', InventoryController.processVoiceSale);
apiRouter.post('/inventory/bulk-import', InventoryController.bulkImport);
apiRouter.get('/inventory/reconciliation', InventoryController.getReconciliation);

// Personal Budget & Categorization (Case 2)
apiRouter.get('/budget/plan', BudgetController.getPlan);
apiRouter.post('/budget/deduct', BudgetController.deductExpense);
apiRouter.post('/budget/resolve-ambiguity', BudgetController.resolveAmbiguity);

// Transit & Korope Fleet (Case 3)
apiRouter.get('/transit/trip', TransitController.getActiveTrip);
apiRouter.post('/transit/collect-fares', TransitController.collectFares);

// Hybrid AI Voice Assistant
apiRouter.post('/assistant/command', AssistantController.processCommand);

