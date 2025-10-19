export interface BoardRecord {
  pk: string;
  sk: string;
  boardId: string;
  name: string;
  status: "ACTIVE" | "DELETED";
  createdAt: string;
  updatedAt: string;
  ownerUserId?: string;
  gsi2pk?: string;
  gsi2sk?: string;
}

export interface BoardTrashRecord {
  pk: string;
  sk: string;
  boardId: string;
  deletedAt: string;
}

export interface ElementRecord {
  pk: string;
  sk: string;
  elementId: string;
  elementData: unknown;
  elementIndex: number;
  updatedAt: string;
  gsi1pk: string;
  gsi1sk: string;
}
