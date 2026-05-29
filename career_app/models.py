from django.db import models

class Position(models.Model):
    title = models.CharField(max_length=255)
    department = models.CharField(max_length=255)
    description = models.TextField()
    is_open = models.BooleanField(default=True)

    def __str__(self):
        return self.title

class Enrollment(models.Model):
    STATUS_CHOICES = [
        ('Pending', 'Pending'),
        ('Reviewed', 'Reviewed'),
        ('Accepted', 'Accepted'),
        ('Rejected', 'Rejected'),
    ]
    position = models.ForeignKey(Position, on_delete=models.CASCADE)
    applicant_name = models.CharField(max_length=255)
    email = models.EmailField()
    resume = models.FileField(upload_to='resumes/')
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='Pending')

    def __str__(self):
        return f"{self.applicant_name} - {self.position.title}"

class OfferLetter(models.Model):
    applicant = models.ForeignKey(Enrollment, on_delete=models.CASCADE)
    salary = models.DecimalField(max_digits=10, decimal_places=2)
    joining_date = models.DateField()
    generated_pdf = models.FileField(upload_to='offers/', blank=True, null=True)

    def __str__(self):
        return f"Offer for {self.applicant.applicant_name}"
