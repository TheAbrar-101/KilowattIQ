import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';

const router = Router();

// GET /api/v1/system/supabase-test
router.get('/supabase-test', async (req: AuthenticatedRequest, res: Response) => {
  const db = SupabaseService.getInstance();
  const urlConfigured = Boolean(process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-supabase-project'));
  const secretConfigured = Boolean(
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY) &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.includes('your-service-role-key')
  );
  const isMock = db.isUsingMock();

  const testResult = await db.testDatabaseConnection();

  if (testResult.success) {
    return res.status(200).json({
      success: true,
      message: testResult.details?.note || 'Supabase PostgreSQL connection successfully verified.',
      data: {
        service: 'KilowattIQ API',
        supabaseUrlConfigured: urlConfigured ? 'YES' : 'NO',
        supabaseSecretConfigured: secretConfigured ? 'YES' : 'NO',
        usingMockData: isMock,
        databaseStatus: testResult.databaseStatus,
        connectionTestDetails: testResult.details,
      },
    });
  } else {
    return res.status(503).json({
      success: false,
      message: 'Supabase PostgreSQL connection test failed.',
      error: testResult.error,
      data: {
        service: 'KilowattIQ API',
        supabaseUrlConfigured: urlConfigured ? 'YES' : 'NO',
        supabaseSecretConfigured: secretConfigured ? 'YES' : 'NO',
        usingMockData: isMock,
        databaseStatus: 'disconnected',
      },
    });
  }
});

export default router;
