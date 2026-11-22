
  
  
  window.shopUrl = '';
  window.routes = {
    cart_add_url: '/cart/add',
    cart_change_url: '/cart/change',
    cart_update_url: '/cart/update',
    cart_url: '/cart',
    search_url: '/search',
    predictive_search_url: '/search/suggest',
  };
  window.cartStrings = {
    error: `There was an error while updating your cart. Please try again.`,
    no_shipping: `We do not ship to this address.`,
    shipping_rate: `Shipping rate for {{address}}`,
    quantityError: `You can only add [quantity] of this item to your cart.`,
    money_format: "${{amount}}",
    quick_edit: `Edit option`,
    cart_symbol: '$',
    discount_removed: `Discount code has been removed.`,
    discount_applied: `Discount code has been applied.`,
    discount_already: `Discount code already applied`,
    discount_error: `Discount code cannot be applied to your cart`
  }
      
  window.themeGlobalVariables = {
    settings: {
      money_format: "${{amount}}",
    }
  }
  window.variantStrings = {
    incoming_with_date: `The stock will arrive on {{ date }}`,
    incoming: `Stock in transit`,
    addToCart: `Add to Cart`,
    addToCartBundle: `Add to Bundle`,
    addedToCartBundle: `Added to Bundle`,
    soldOut: `Out of Stock`,
    unavailable: `Unavailable`,
    outStock: `Out stock`,
    preOrder: `Pre-Order`,
    save: `Save`,
    inStock: `In stock`,
    addSuccess: `Product added to cart successfully`,
    addGiftCard: `Add gift card successfully`,
    removeCartItem: `Remove item successfully`,
    unavailable_with_option: `[value] - Unavailable`,
    sale: "On sale"
  };window.flashingBrowseTab = {
    enable: true,
    firstNotification: "Come back!",
    secondaryNotification: "Your cart is waiting",
    interval: 2,
    enableAwayFavicon: false,
    awayFavicon: "",
    enableCartTabMessage: false,
    cartTabTemplate: "({count}) items in your cart",
    cartCount: 0,
    enableIdle: false,
    idleThreshold: 120,
    idleMessage: "Still there?"
  };
