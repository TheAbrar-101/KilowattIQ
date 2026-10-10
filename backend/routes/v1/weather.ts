/**
 * Express REST API Routes - Weather & Meteorological Energy Impact Subsystem
 * 
 * Endpoints:
 * - GET  /api/v1/weather/impact: Comprehensive weather, CDD, AC prediction & heatwave projections
 * - GET  /api/v1/weather/cities: List supported Bangladeshi divisional meteorological hubs
 * - POST /api/v1/weather/clear-cache: Invalidate in-memory 30-min cache
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { WeatherService, BANGLADESH_CITIES } from '../../../src/server/weather/weatherService';
import { BangladeshCity } from '../../../src/server/weather/types';
import { SupabaseService } from '../../services/SupabaseService';

const router = Router();
const weatherService = WeatherService.getInstance();
const db = SupabaseService.getInstance();

// GET /api/v1/weather/cities
router.get('/cities', (_req: AuthenticatedRequest, res: Response) => {
  const cities = Object.values(BANGLADESH_CITIES);
  return res.json({
    status: 'success',
    data: {
      cities,
      defaultCity: 'Dhaka',
    },
  });
});

// GET /api/v1/weather/impact
router.get('/impact', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const queryCity = (req.query.city as BangladeshCity) || 'Dhaka';
    const city = BANGLADESH_CITIES[queryCity] ? queryCity : 'Dhaka';

    const householdId = (req.query.householdId as string) || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
    const household = await db.getHouseholdById(householdId);

    const sanctionedLoadKw = household?.sanctionedLoadKw || 4.5;
    const currentMonthKwh = req.query.kwh ? Number(req.query.kwh) : 285;

    const report = await weatherService.getWeatherEnergyImpact(
      city,
      sanctionedLoadKw,
      currentMonthKwh
    );

    return res.json({
      status: 'success',
      data: report,
    });
  } catch (err: any) {
    console.error('[WeatherRoute ERROR] Failed to fetch weather energy impact:', err);
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Failed to generate weather energy impact report',
    });
  }
});

// POST /api/v1/weather/clear-cache
router.post('/clear-cache', (_req: AuthenticatedRequest, res: Response) => {
  weatherService.clearCache();
  return res.json({
    status: 'success',
    message: 'Weather service 30-minute cache cleared successfully',
  });
});

export default router;
