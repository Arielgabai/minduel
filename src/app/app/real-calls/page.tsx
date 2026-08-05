import { requireTelepro } from "@/lib/auth";
import {
  listRealCallsForTelepro,
  REAL_CALL_RIGHTS_CONFIRMATION,
} from "@/lib/realCallService";
import { serverConfig } from "@/lib/config";
import { RealCallsClient } from "./RealCallsClient";

export default async function RealCallsPage() {
  const telepro = await requireTelepro();
  const items = await listRealCallsForTelepro({
    id: telepro.id,
    organizationId: telepro.organizationId,
    role: telepro.role,
  });

  return (
    <RealCallsClient
      initialItems={items}
      rightsConfirmationText={REAL_CALL_RIGHTS_CONFIRMATION}
      maxUploadMb={serverConfig.storage.maxUploadMb}
    />
  );
}
