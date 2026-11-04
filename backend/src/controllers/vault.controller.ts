import type { Request, Response } from 'express';
import { container } from '../../../core/container';

export class VaultController {
  public static async lockVault(req: Request, res: Response): Promise<void> {
    try {
      const { userId, amount, durationHours, currency } = req.body;
      const result = await container.lockMarketVaultUseCase.execute({
        userId: userId || 'USER-MALIK-01',
        amount: Number(amount) || 10000,
        durationHours: Number(durationHours) || 5,
        currency: currency || 'NGN',
      });

      if (result.isSuccess) {
        res.status(201).json({ success: true, data: result.getValue() });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }

  public static async meltVault(req: Request, res: Response): Promise<void> {
    try {
      const { userId, vaultId, refundToAccountId } = req.body;
      const result = await container.meltMarketVaultUseCase.execute({
        userId: userId || 'USER-MALIK-01',
        vaultId,
        refundToAccountId: refundToAccountId || 'checking',
      });

      if (result.isSuccess) {
        res.status(200).json({ success: true, data: result.getValue() });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }

  public static async getActiveVault(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.userId || 'USER-MALIK-01';
      const vault = await container.marketVaultRepository.getActiveVault(userId);

      if (!vault) {
        res.status(404).json({ success: false, message: 'No active Market Vault found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          id: vault.id.toValue(),
          allocated: vault.allocatedAmount.format(),
          spent: vault.spentAmount.format(),
          remaining: vault.remainingAmount.format(),
          durationHours: vault.durationHours,
          expiresAt: vault.expiresAt.toISOString(),
          lockHash: vault.cryptographicLockHash,
          preAuthId: vault.paypalPreAuthId,
          status: vault.status,
          isActive: vault.isActive,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }
}

