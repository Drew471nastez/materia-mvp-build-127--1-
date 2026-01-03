export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  headline: string | null
  niche_tags: string[]
  featured_product_id: string | null
  twitter_url: string | null
  instagram_url: string | null
  youtube_url: string | null
  website_url: string | null
  created_at: string
  updated_at: string
}

export interface ReviewsSettings extends BaseSectionSettings {
  headline: string
  showAverageRating: boolean
  showReviewCount: boolean
  showStarRatings: boolean  // ADD THIS LINE - controls if stars are displayed
  maxReviewsToShow: number
}

export interface Creator {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  cover_image_url: string | null
  bio: string | null
  headline: string | null
  niche_tags: string[]
  featured_product_id: string | null
  twitter_url: string | null
  instagram_url: string | null
  youtube_url: string | null
  website_url: string | null
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  creator_id: string
  title: string
  slug: string
  description: string | null
  cover_image_url: string | null
  gallery_images: string[]
  price: number
  currency: string
  is_free: boolean
  file_url: string | null
  file_name: string | null
  file_size: number | null
  file_type: string | null
  tags: string[]
  status: "draft" | "published" | "archived"
  created_at: string
  updated_at: string
}

export interface Purchase {
  id: string
  product_id: string
  buyer_email: string
  buyer_name: string | null
  amount_paid: number
  currency: string
  payment_provider: "stripe" | "paypal" | "other"
  payment_intent_id: string | null
  created_at: string
}

export interface Review {
  id: string
  product_id: string
  rating: number
  comment: string | null
  reviewer_name: string | null
  created_at: string
}

export interface ProductWithCreator extends Product {
  creator: Creator
  reviews: Review[]
  review_count: number
  avg_rating: number
}

export interface CreatorStore {
  creator: Creator
  products: Product[]
  featured_product: Product | null
}

export interface ApiResponse<T> {
  data: T | null
  error: string | null
}
