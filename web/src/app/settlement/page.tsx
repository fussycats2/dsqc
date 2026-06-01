import { envMissing } from "@/lib/getProcesses";
import { getWorkDate } from "@/lib/workDate";
import { getSettlement } from "./settlementActions";
import { SettlementView } from "./SettlementView";

export default async function SettlementPage() {
  if (envMissing()) {
    return <main className="p-8 text-sm">Supabase 연결이 설정되지 않았습니다.</main>;
  }
  const workDate = await getWorkDate();
  const data = await getSettlement(workDate);
  return <SettlementView workDate={workDate} initial={data} />;
}
