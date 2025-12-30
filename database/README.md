# Leqet Fit Coach - Database

This directory contains the database schema and migration scripts for the Leqet Fit Coach application.

## Database Schema

The database is designed to support all features of the Leqet Fit Coach application, including user management, meal tracking, workout logging, and professional coaching relationships.

### Key Tables

- `users` - User accounts with authentication details
- `member_profiles` - Extended profile information for members
- `food_items` - Food database with nutritional information
- `meal_logs` - Log of user meals
- `workout_logs` - Log of user workouts
- `diet_plans` - Diet plans created by nutritionists
- `workout_plans` - Workout plans created by trainers

## Setup

1. **Prerequisites**
   - PostgreSQL 12+
   - Node.js 16+ (for running migrations)
   - pgAdmin or similar database management tool (optional)

2. **Environment Setup**
   Create a `.env` file in the project root with the following variables:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=leqet_fit_coacha
   DB_USER=your_username
   DB_PASSWORD=your_password
   NODE_ENV=development
   ```

3. **Running Migrations**
   ```bash
   # Install dependencies
   npm install
   
   # Run migrations
   npm run migrate:up
   ```

## Migration Scripts

- `001_initial_schema_enhancements.sql` - Initial schema setup with security and performance improvements

## Useful Queries

### Get Weekly Nutrition Summary
```sql
SELECT * FROM weekly_nutrition_summary 
WHERE member_id = 1 
ORDER BY week_start DESC;
```

### Get User Plan Status
```sql
SELECT * FROM get_user_plan_status(1);
```

### Search Food Items
```sql
SELECT * FROM food_items 
WHERE search_vector @@ plainto_tsquery('english', 'chicken')
ORDER BY ts_rank(search_vector, plainto_tsquery('english', 'chicken')) DESC;
```

## Backup and Restore

### Create Backup
```bash
pg_dump -U username -d leqet_fit_coacha -f backup.sql
```

### Restore from Backup
```bash
psql -U username -d leqet_fit_coacha -f backup.sql
```

## Performance Optimization

1. **Indexes** have been added for common query patterns
2. **Materialized Views** are used for frequently accessed reports
3. **Full-text search** is implemented for food item search

## Security

- Password hashing is handled by the application layer
- Sensitive fields are not logged
- All queries use parameterized statements to prevent SQL injection

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Ensure PostgreSQL is running
   - Check firewall settings
   - Verify credentials in `.env`

2. **Migration Errors**
   - Check for existing tables that might conflict
   - Ensure you have the correct permissions
   - Check the PostgreSQL logs for detailed error messages

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.
