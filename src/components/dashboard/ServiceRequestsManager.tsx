import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare } from "lucide-react";

interface ServiceRequest {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed" | "rejected";
  priority: number;
  created_at: string;
  profiles: {
    full_name: string;
  };
}

interface ServiceRequestsManagerProps {
  adminId: string;
}

export const ServiceRequestsManager = ({ adminId }: ServiceRequestsManagerProps) => {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchRequests();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("service_requests_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_requests",
          filter: `admin_id=eq.${adminId}`,
        },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminId]);

  const fetchRequests = async () => {
    const { data, error } = await supabase
      .from("service_requests")
      .select(`
        *,
        profiles!service_requests_client_id_fkey (full_name)
      `)
      .eq("admin_id", adminId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setRequests(data || []);
  };

  const updateStatus = async (id: string, status: "pending" | "in_progress" | "completed" | "rejected") => {
    const { error } = await supabase
      .from("service_requests")
      .update({ status })
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Status updated successfully" });
    fetchRequests();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityLabel = (priority: number) => {
    if (priority >= 4) return "High";
    if (priority >= 2) return "Medium";
    return "Low";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Service Requests</CardTitle>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <p className="text-muted-foreground">No service requests yet.</p>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <div key={request.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">{request.title}</h3>
                  </div>
                  <Badge variant="outline" className={getStatusColor(request.status)}>
                    {request.status.replace("_", " ")}
                  </Badge>
                </div>

                {request.description && (
                  <p className="text-sm text-muted-foreground mb-3">{request.description}</p>
                )}

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">
                      From: <span className="font-medium">{request.profiles.full_name}</span>
                    </span>
                    <Badge variant="outline">
                      {getPriorityLabel(request.priority)} Priority
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(request.created_at).toLocaleString()}
                    </span>
                  </div>

                  <Select
                    value={request.status}
                    onValueChange={(value) => updateStatus(request.id, value as "pending" | "in_progress" | "completed" | "rejected")}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
