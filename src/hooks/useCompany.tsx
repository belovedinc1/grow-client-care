import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type CompanyRole = "admin" | "agent" | "client";

export interface Membership {
  company_id: string;
  company_name: string;
  role: CompanyRole;
  full_name: string | null;
}

export const useCompany = (user: User | null) => {
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setMembership(null);
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("company_members")
        .select("company_id, role, full_name, companies!inner(name)")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setMembership(null);
      } else {
        setMembership({
          company_id: data.company_id,
          company_name: (data.companies as any)?.name ?? "",
          role: data.role as CompanyRole,
          full_name: data.full_name,
        });
      }
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { membership, loading };
};
