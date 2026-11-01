import type { Metadata } from "next";
import { PILOT_CORRIDOR } from "@/sim/pilotCorridor";
import { LabPage, labMetadata } from "./LabPage";

// the Lab opens on the pilot; every other spot has its own static page at /pilot/<spot>
export const metadata: Metadata = labMetadata(PILOT_CORRIDOR);

export default function PilotPage() {
  return <LabPage corridor={PILOT_CORRIDOR} />;
}
