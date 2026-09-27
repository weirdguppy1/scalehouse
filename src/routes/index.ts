import { Router } from "express";
import { healthRouter } from "./health";
import { customerApiRouter } from "./customer-api";

export const apiRouter = Router();
apiRouter.use("/health", healthRouter);
apiRouter.use("/v1", customerApiRouter);
