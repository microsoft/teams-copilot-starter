export interface UserTask {
  id: string;
  eTag: string;
  userId: string;
  userPrincipalName: string;
  userDisplayName: string;
  planId: string;
  title: string;
  dueDateTime: string;
  percentComplete: number;
  createdBy: string;
  createdDateTime: string;
  assignedId: string;
  assignedDateTime: string;
  status: string;
  statusIcon?: string;
  summary?: string;
}
