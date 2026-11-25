export type UserRole = 'user' | 'admin';

export type RecipeCategory = 'breakfast' | 'main' | 'dessert';

export interface User {
  id: number;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface AdminUser extends User {
  recipeCount: number;
}

export interface Recipe {
  id: number;
  userId: number;
  title: string;
  ingredients: string;
  steps: string;
  category: RecipeCategory;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeInput {
  title: string;
  ingredients: string;
  steps: string;
  category: RecipeCategory;
}

export const CATEGORY_LABELS: Record<RecipeCategory, string> = {
  breakfast: 'Breakfast',
  main: 'Main',
  dessert: 'Dessert',
};
