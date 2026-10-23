import { MapHome } from "@/components/MapHome";
import areasData from "@/data/areas.json";
import type { AreaWithStretches } from "@/components/CityMap";

const data = areasData as unknown as { generated: string; hours: number[]; areas: AreaWithStretches[] };

export default function Home() {
  return <MapHome data={data} />;
}
