// MUST be first import - loads dotenv before anything else
import { config } from './env.js';

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { connectDB } from './config/database.js';
import gameRoutes from './routes/game.routes.js';
import { initializeServices } from './services/index.js';

const app: Application = express();
const PORT = config.port;

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
  })
);
app.use(express.json());

// Debug logging
app.use((req, _res, next) => {
  // eslint-disable-next-line no-console
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, req.body);
  next();
});

// Routes
app.use('/api/game', gameRoutes);

// Health check (both paths for flexibility)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const startServer = async (): Promise<void> => {
  try {
    await connectDB();
    // eslint-disable-next-line no-console
    console.log('Initializing services...');
    await initializeServices();
    // eslint-disable-next-line no-console
    console.log('Services initialized');
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
