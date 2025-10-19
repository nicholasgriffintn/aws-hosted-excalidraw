export interface Board {
  id: string;
  name: string;
  status: 'ACTIVE' | 'DELETED';
  createdAt: string;
  updatedAt: string;
}

export interface TrashBoard extends Board {
  deletedAt?: string;
}
