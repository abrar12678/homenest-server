export {};
// User
export interface IUser {
  _id?: string;
  name: string;
  email: string;
  password: string;
  role: 'user' | 'agent';
  avatar?: string;
  phone?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Property
export interface IProperty {
  _id?: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  propertyType: 'apartment' | 'villa' | 'commercial' | 'land';
  price: number;
  priceType: 'monthly' | 'total';
  location: { city: string; area: string };
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
  amenities: string[];
  images: string[];
  rating: number;
  reviewCount: number;
  views: number;
  isFeatured: boolean;
  postedBy: string;
  createdAt?: string;
  updatedAt?: string;
}

// Review
export interface IReview {
  _id?: string;
  propertyId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt?: string;
}

// Contact Message
export interface IContactMessage {
  _id?: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt?: string;
}

// Auth responses
export interface IAuthResponse {
  user: Omit<IUser, 'password'>;
  token: string;
}

// Pagination response
export interface IPaginatedResponse<T> {
  properties: T[];
  total: number;
  page: number;
  totalPages: number;
}

// Stats response
export interface IStatsResponse {
  totalProperties: number;
  totalUsers: number;
  totalReviews: number;
  totalCities: number;
}